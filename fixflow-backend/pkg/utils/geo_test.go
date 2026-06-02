package utils

import (
	"testing"
)

func TestHaversine(t *testing.T) {
	// Coordinate 1: Kozhikode (11.2588, 75.7804)
	// Coordinate 2: Kochi (9.9312, 76.2673)
	// Distance should be approximately 157.9 km
	lat1, lng1 := 11.2588, 75.7804
	lat2, lng2 := 9.9312, 76.2673

	dist := Haversine(lat1, lng1, lat2, lng2)
	expectedMin, expectedMax := 156.0, 160.0
	if dist < expectedMin || dist > expectedMax {
		t.Errorf("expected distance between %f and %f, got %f", expectedMin, expectedMax, dist)
	}
}

func TestCalculateETA(t *testing.T) {
	dist := 15.0 // km
	// 15 km at 30 km/h = 0.5 hours = 30 minutes
	eta := CalculateETA(dist)
	if eta != 30 {
		t.Errorf("expected ETA to be 30 minutes, got %d", eta)
	}

	dist2 := 2.5 // km
	// 2.5 km at 30 km/h = 5 minutes
	eta2 := CalculateETA(dist2)
	if eta2 != 5 {
		t.Errorf("expected ETA to be 5 minutes, got %d", eta2)
	}
}
