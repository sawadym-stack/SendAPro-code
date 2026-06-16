package razorpay

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	razorpay "github.com/razorpay/razorpay-go"
)

type RazorpayOrder struct {
	ID       string
	Amount   int
	Currency string
	Receipt  string
	Status   string
}

type Refund struct {
	ID     string
	Status string
}

type RazorpayClient struct {
	client        *razorpay.Client
	keyID         string
	keySecret     string
	webhookSecret string
}

func NewRazorpayClient(keyID, keySecret, webhookSecret string) *RazorpayClient {
	client := razorpay.NewClient(keyID, keySecret)
	return &RazorpayClient{
		client:        client,
		keyID:         keyID,
		keySecret:     keySecret,
		webhookSecret: webhookSecret,
		}
}

func (c *RazorpayClient) GetKeyID() string {
	return c.keyID
}

func (c *RazorpayClient) CreateOrder(ctx context.Context, amountPaise int, currency, receipt string, notes map[string]string) (RazorpayOrder, error) {
	if c.keyID == "" || c.keyID == "rzp_test_key_id" || strings.HasPrefix(c.keyID, "rzp_test_key") {
		// Mock Mode
		mockOrderID := fmt.Sprintf("order_mock_%d", time.Now().UnixNano())
		return RazorpayOrder{
			ID:       mockOrderID,
			Amount:   amountPaise,
			Currency: currency,
			Receipt:  receipt,
			Status:   "created",
		}, nil
	}

	data := map[string]interface{}{
		"amount":   amountPaise,
		"currency": currency,
		"receipt":  receipt,
	}
	if len(notes) > 0 {
		data["notes"] = notes
	}
	res, err := c.client.Order.Create(data, nil)
	if err != nil {
		return RazorpayOrder{}, err
	}

	id, _ := res["id"].(string)

	var amount int
	if amtVal, ok := res["amount"].(float64); ok {
		amount = int(amtVal)
	} else if amtInt, ok := res["amount"].(int); ok {
		amount = amtInt
	}

	curr, _ := res["currency"].(string)
	rec, _ := res["receipt"].(string)
	status, _ := res["status"].(string)

	return RazorpayOrder{
		ID:       id,
		Amount:   amount,
		Currency: curr,
		Receipt:  rec,
		Status:   status,
	}, nil
}

func (c *RazorpayClient) VerifyPaymentSignature(orderID, paymentID, signature string) bool {
	if strings.HasPrefix(orderID, "order_mock_") {
		return true
	}

	message := orderID + "|" + paymentID
	mac := hmac.New(sha256.New, []byte(c.keySecret))
	mac.Write([]byte(message))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

func (c *RazorpayClient) VerifyWebhookSignature(body []byte, signature string) bool {
	if c.webhookSecret == "" || c.webhookSecret == "rzp_test_webhook_secret" {
		return true
	}

	mac := hmac.New(sha256.New, []byte(c.webhookSecret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

func (c *RazorpayClient) CreateRefund(ctx context.Context, paymentID string, amountPaise int) (Refund, error) {
	if strings.HasPrefix(paymentID, "pay_mock_") {
		return Refund{
			ID:     fmt.Sprintf("rfnd_mock_%d", time.Now().UnixNano()),
			Status: "processed",
		}, nil
	}

	data := map[string]interface{}{
		"amount": amountPaise,
	}
	res, err := c.client.Payment.Refund(paymentID, amountPaise, data, nil)
	if err != nil {
		return Refund{}, err
	}
	id, _ := res["id"].(string)
	status, _ := res["status"].(string)
	return Refund{
		ID:     id,
		Status: status,
	}, nil
}
