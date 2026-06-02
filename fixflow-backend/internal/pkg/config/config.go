package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

// Config holds all runtime configuration loaded from env.
type Config struct {
	AppName         string `mapstructure:"APP_NAME"`
	AppEnv          string `mapstructure:"APP_ENV"`
	ServerHost      string `mapstructure:"SERVER_HOST"`
	ServerPort      string `mapstructure:"SERVER_PORT"`
	GRPCPort        string `mapstructure:"GRPC_PORT"`
	LogLevel        string `mapstructure:"LOG_LEVEL"`
	PostgresURL     string `mapstructure:"POSTGRES_URL"`
	RedisAddr       string `mapstructure:"REDIS_ADDR"`
	RedisPassword   string `mapstructure:"REDIS_PASSWORD"`
	RedisDB         int    `mapstructure:"REDIS_DB"`
	MinIOEndpoint   string `mapstructure:"MINIO_ENDPOINT"`
	MinIOAccessKey  string `mapstructure:"MINIO_ACCESS_KEY"`
	MinIOSecretKey  string `mapstructure:"MINIO_SECRET_KEY"`
	MinIOBucket     string `mapstructure:"MINIO_BUCKET"`
	MinIOUseSSL     bool   `mapstructure:"MINIO_USE_SSL"`
	JWTSecret       string `mapstructure:"JWT_SECRET"`
	JWTExpiryHours  int    `mapstructure:"JWT_EXPIRY_HOURS"`
	JWTAccessExpiryMinutes int `mapstructure:"JWT_ACCESS_EXPIRY_MINUTES"`
	JWTRefreshExpiryDays   int `mapstructure:"JWT_REFRESH_EXPIRY_DAYS"`
	JaegerEndpoint  string `mapstructure:"JAEGER_ENDPOINT"`
	OTLPExporterURL string `mapstructure:"OTEL_EXPORTER_OTLP_ENDPOINT"`
	FirebaseCredsFile string `mapstructure:"FIREBASE_CREDENTIALS_FILE"`
	RazorpayKeyID         string `mapstructure:"RAZORPAY_KEY_ID"`
	RazorpayKeySecret     string `mapstructure:"RAZORPAY_KEY_SECRET"`
	RazorpayWebhookSecret string `mapstructure:"RAZORPAY_WEBHOOK_SECRET"`
	SMTPHost              string `mapstructure:"SMTP_HOST"`
	SMTPPort              int    `mapstructure:"SMTP_PORT"`
	SMTPUser              string `mapstructure:"SMTP_USER"`
	SMTPPass              string `mapstructure:"SMTP_PASS"`
	SMTPSender            string `mapstructure:"SMTP_SENDER"`
}

func Load() (*Config, error) {
	v := viper.New()
	v.SetConfigFile(".env")
	v.SetConfigType("env")
	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	setDefaults(v)

	_ = v.ReadInConfig()

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}

	return &cfg, nil
}

func setDefaults(v *viper.Viper) {
	v.SetDefault("APP_NAME", "fixflow-backend")
	v.SetDefault("APP_ENV", "development")
	v.SetDefault("SERVER_HOST", "0.0.0.0")
	v.SetDefault("SERVER_PORT", "8080")
	v.SetDefault("GRPC_PORT", "9090")
	v.SetDefault("LOG_LEVEL", "debug")
	v.SetDefault("POSTGRES_URL", "postgres://fixflow:fixflow@127.0.0.1:5433/fixflow?sslmode=disable")
	v.SetDefault("REDIS_ADDR", "127.0.0.1:6379")
	v.SetDefault("REDIS_PASSWORD", "")
	v.SetDefault("REDIS_DB", 0)
	v.SetDefault("MINIO_ENDPOINT", "127.0.0.1:9000")
	v.SetDefault("MINIO_ACCESS_KEY", "minioadmin")
	v.SetDefault("MINIO_SECRET_KEY", "minioadmin")
	v.SetDefault("MINIO_BUCKET", "fixflow")
	v.SetDefault("MINIO_USE_SSL", false)
	v.SetDefault("JWT_SECRET", "change-me")
	v.SetDefault("JWT_EXPIRY_HOURS", 24)
	v.SetDefault("JWT_ACCESS_EXPIRY_MINUTES", 15)
	v.SetDefault("JWT_REFRESH_EXPIRY_DAYS", 7)
	v.SetDefault("JAEGER_ENDPOINT", "http://127.0.0.1:16686")
	v.SetDefault("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318")
	v.SetDefault("FIREBASE_CREDENTIALS_FILE", "firebase-credentials.json")
	v.SetDefault("RAZORPAY_KEY_ID", "rzp_test_key_id")
	v.SetDefault("RAZORPAY_KEY_SECRET", "rzp_test_key_secret")
	v.SetDefault("RAZORPAY_WEBHOOK_SECRET", "rzp_test_webhook_secret")
	v.SetDefault("SMTP_HOST", "smtp.gmail.com")
	v.SetDefault("SMTP_PORT", 587)
	v.SetDefault("SMTP_USER", "")
	v.SetDefault("SMTP_PASS", "")
	v.SetDefault("SMTP_SENDER", "")
}
