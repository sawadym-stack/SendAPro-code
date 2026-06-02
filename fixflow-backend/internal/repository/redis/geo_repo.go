package redisrepo

import (
	"context"
	"fmt"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type TechnicianLocation struct {
	TechnicianID string
	Latitude     float64
	Longitude    float64
	DistanceKm   float64
}

type GeoRepository struct {
	rdb *redis.Client
	db  *pgxpool.Pool
}

func NewGeoRepository(rdb *redis.Client, db *pgxpool.Pool) *GeoRepository {
	return &GeoRepository{rdb: rdb, db: db}
}

func (r *GeoRepository) UpdateLocation(ctx context.Context, techID string, lat, lng float64) error {
	resolvedTechID := techID
	if techID != "" {
		var techUUID string
		err := r.db.QueryRow(ctx, `SELECT id FROM technicians WHERE user_id = $1 OR id = $1`, techID).Scan(&techUUID)
		if err == nil {
			resolvedTechID = techUUID
		}
	}

	if err := r.rdb.GeoAdd(ctx, "technicians:geo", &redis.GeoLocation{Name: resolvedTechID, Latitude: lat, Longitude: lng}).Err(); err != nil {
		return err
	}

	_, err := r.db.Exec(ctx, `
		UPDATE technicians 
		SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
		    updated_at = NOW()
		WHERE id = $3 OR user_id = $3
	`, lng, lat, resolvedTechID)
	if err != nil {
		return err
	}

	return r.rdb.HSet(ctx, "tech:location:"+resolvedTechID, "lat", fmt.Sprintf("%f", lat), "lng", fmt.Sprintf("%f", lng)).Err()
}

func (r *GeoRepository) NearbyTechnicians(ctx context.Context, lat, lng, radiusKm float64, serviceType string, limit int) ([]TechnicianLocation, error) {
	results, err := r.rdb.GeoRadius(ctx, "technicians:geo", lng, lat, &redis.GeoRadiusQuery{
		Radius:    radiusKm,
		Unit:      "km",
		Count:     limit,
		Sort:      "ASC",
		WithDist:  true,
		WithCoord: true,
	}).Result()
	if err != nil {
		return nil, err
	}

	out := make([]TechnicianLocation, 0, len(results))
	for _, hit := range results {
		if ok, err := r.isOnline(ctx, hit.Name); err != nil || !ok {
			continue
		}
		if ok, err := r.isVerifiedAndMatchesService(ctx, hit.Name, serviceType); err != nil || !ok {
			continue
		}
		out = append(out, TechnicianLocation{
			TechnicianID: hit.Name,
			Latitude:     hit.Latitude,
			Longitude:    hit.Longitude,
			DistanceKm:   hit.Dist,
		})
	}
	return out, nil
}

func (r *GeoRepository) NearestOnline(ctx context.Context, lat, lng, radiusKm float64, serviceType string, limit int) ([]TechnicianLocation, error) {
	return r.NearbyTechnicians(ctx, lat, lng, radiusKm, serviceType, limit)
}

func (r *GeoRepository) GetLocation(ctx context.Context, techID string) (lat, lng float64, err error) {
	resolvedTechID := techID
	if techID != "" {
		var techUUID string
		err := r.db.QueryRow(ctx, `SELECT id FROM technicians WHERE user_id = $1 OR id = $1`, techID).Scan(&techUUID)
		if err == nil {
			resolvedTechID = techUUID
		}
	}

	vals, err := r.rdb.HMGet(ctx, "tech:location:"+resolvedTechID, "lat", "lng").Result()
	if err != nil {
		return 0, 0, err
	}
	if len(vals) != 2 || vals[0] == nil || vals[1] == nil {
		return 0, 0, fmt.Errorf("location not found")
	}
	lat, err = strconv.ParseFloat(vals[0].(string), 64)
	if err != nil {
		return 0, 0, err
	}
	lng, err = strconv.ParseFloat(vals[1].(string), 64)
	if err != nil {
		return 0, 0, err
	}
	return lat, lng, nil
}

func (r *GeoRepository) isOnline(ctx context.Context, techID string) (bool, error) {
	resolvedTechID := techID
	if techID != "" {
		var techUUID string
		err := r.db.QueryRow(ctx, `SELECT id FROM technicians WHERE user_id = $1 OR id = $1`, techID).Scan(&techUUID)
		if err == nil {
			resolvedTechID = techUUID
		}
	}

	status, err := r.rdb.HGet(ctx, "tech:availability:"+resolvedTechID, "status").Result()
	if err != nil {
		if err == redis.Nil {
			return false, nil
		}
		return false, err
	}
	return status == "Online", nil
}

func (r *GeoRepository) isVerifiedAndMatchesService(ctx context.Context, techID, serviceType string) (bool, error) {
	const q = `SELECT u.is_verified, COALESCE(
		EXISTS(
			SELECT 1 FROM unnest(t.skills) s 
			WHERE LOWER(s) = LOWER($2)
			   OR (LOWER(s) = 'electrical' AND LOWER($2) = 'electrician')
			   OR (LOWER(s) = 'plumbing' AND LOWER($2) = 'plumber')
			   OR (LOWER(s) = 'carpentry' AND LOWER($2) = 'carpenter')
			   OR (LOWER(s) = 'painting' AND LOWER($2) = 'painter')
			   OR (
			       (LOWER(s) = 'ac_repair' OR LOWER(s) = 'ac repair' OR LOWER(s) = 'ac') AND
			       (LOWER($2) = 'ac_repair' OR LOWER($2) = 'ac repair' OR LOWER($2) = 'ac')
			   )
		), false)
FROM technicians t
JOIN users u ON u.id = t.user_id
WHERE t.id::text = $1 OR t.user_id::text = $1
LIMIT 1`
	var verified, hasSkill bool
	if err := r.db.QueryRow(ctx, q, techID, serviceType).Scan(&verified, &hasSkill); err != nil {
		return false, err
	}
	if serviceType == "" {
		return verified, nil
	}
	return verified && hasSkill, nil
}

func (r *GeoRepository) GetAvailability(ctx context.Context, techID string) (string, error) {
	resolvedTechID := techID
	if techID != "" {
		var techUUID string
		err := r.db.QueryRow(ctx, `SELECT id FROM technicians WHERE user_id = $1 OR id = $1`, techID).Scan(&techUUID)
		if err == nil {
			resolvedTechID = techUUID
		}
	}
	status, err := r.rdb.HGet(ctx, "tech:availability:"+resolvedTechID, "status").Result()
	if err == redis.Nil {
		return "Offline", nil
	}
	return status, err
}

func (r *GeoRepository) SetAvailability(ctx context.Context, techID, status, jobID string) error {
	resolvedTechID := techID
	if techID != "" {
		var techUUID string
		err := r.db.QueryRow(ctx, `SELECT id FROM technicians WHERE user_id = $1 OR id = $1`, techID).Scan(&techUUID)
		if err == nil {
			resolvedTechID = techUUID
		}
	}
	key := "tech:availability:" + resolvedTechID
	if err := r.rdb.HSet(ctx, key, "status", status, "jobId", jobID).Err(); err != nil {
		return err
	}
	isAvailable := status == "Online"
	_, _ = r.db.Exec(ctx, `UPDATE technicians SET is_available = $1, updated_at = NOW() WHERE id = $2`, isAvailable, resolvedTechID)
	return nil
}
