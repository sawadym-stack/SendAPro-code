package worker

import (
	"context"
	"fmt"
	"log"

	"github.com/redis/go-redis/v9"
	"github.com/yourname/fixflow-backend/infrastructure/firebase"
	domain "github.com/yourname/fixflow-backend/internal/domain/supplier"
)

func RunQuotationExpiry(
	ctx context.Context,
	quotationRepo domain.QuotationRepository,
	materialRepo domain.MaterialRepository,
	redis *redis.Client,
	fcmClient *firebase.FCMClient,
) {
	count, expired, err := quotationRepo.ExpireOldQuotations(ctx)
	if err != nil {
		log.Printf("[Quotation Expiry Worker] Error expiring quotations: %v", err)
		return
	}

	if count == 0 {
		return
	}

	log.Printf("[Quotation Expiry Worker] Expired %d quotations", count)

	for _, q := range expired {
		material, err := materialRepo.GetMaterial(ctx, q.MaterialID)
		materialName := "Requested material"
		if err == nil {
			materialName = material.Name
		}

		if fcmClient != nil {
			title := "Quotation request expired"
			body := fmt.Sprintf("Your quotation request for %s expired", materialName)
			pushErr := fcmClient.SendPushWithRetry(ctx, firebase.PushRequest{
				UserID: q.RequesterID,
				Title:  title,
				Body:   body,
				Type:   "quotation_expired",
			}, 3)
			if pushErr != nil {
				log.Printf("[Quotation Expiry Worker] Failed to send FCM for quotation %s: %v", q.ID, pushErr)
			}
		}
	}
}
