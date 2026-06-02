package utils

import "math"

// Haversine calculates the great-circle distance between two points on Earth in kilometers.
func Haversine(lat1, lng1, lat2, lng2 float64) float64 {
	R := 6371.0 // Earth radius km
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// CalculateETA estimates the travel time in minutes assuming a 30 km/h average speed.
func CalculateETA(distKm float64) int {
	avgSpeedKmh := 30.0
	return int(math.Ceil(distKm / avgSpeedKmh * 60))
}
