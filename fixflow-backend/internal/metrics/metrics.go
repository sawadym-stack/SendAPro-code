package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// WSConnectionsActive tracks the number of active WebSocket clients connected to the hub.
	WSConnectionsActive = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "ws_connections_active",
		Help: "The total number of active WebSocket connections",
	})

	// WSMessagesSentTotal tracks the total count of messages successfully written to WebSocket connections.
	WSMessagesSentTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "ws_messages_sent_total",
		Help: "The total number of messages sent over WebSockets",
	})

	// GRPCStreamActive tracks the number of active location tracking gRPC stream connections.
	GRPCStreamActive = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "grpc_stream_active",
		Help: "The total number of active gRPC StreamLocation connections",
	})
)
