package validator

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/go-playground/validator/v10"
)

var validate *validator.Validate

func init() {
	validate = validator.New()

	// Register phone validation tag (Indian mobile number: starts with 6,7,8,9 and has 10 digits)
	_ = validate.RegisterValidation("phone", func(fl validator.FieldLevel) bool {
		phone := fl.Field().String()
		re := regexp.MustCompile(`^[6-9]\d{9}$`)
		return re.MatchString(phone)
	})

	// Register lat/lng validators for India bounds: lat 8-37, lng 68-97
	_ = validate.RegisterValidation("indialat", func(fl validator.FieldLevel) bool {
		lat := fl.Field().Float()
		return lat >= 8 && lat <= 37
	})

	_ = validate.RegisterValidation("indialng", func(fl validator.FieldLevel) bool {
		lng := fl.Field().Float()
		return lng >= 68 && lng <= 97
	})
}

// ValidationErrorDetails represents structured field-level validation errors
type ValidationErrorDetails struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// GetValidator returns the underlying validator instance
func GetValidator() *validator.Validate {
	return validate
}

// ValidateStruct validates a struct and returns formatted error details
func ValidateStruct(s interface{}) []ValidationErrorDetails {
	err := validate.Struct(s)
	if err == nil {
		return nil
	}

	var details []ValidationErrorDetails
	if validationErrors, ok := err.(validator.ValidationErrors); ok {
		for _, ve := range validationErrors {
			field := strings.ToLower(ve.Field())
			message := fmt.Sprintf("Field validation for '%s' failed on the '%s' tag", ve.Field(), ve.Tag())

			switch ve.Tag() {
			case "required":
				message = fmt.Sprintf("%s is required", ve.Field())
			case "email":
				message = "Invalid email format"
			case "phone":
				message = "Phone must be 10 digits and start with 6-9"
			case "min":
				message = fmt.Sprintf("Must be at least %s characters long", ve.Param())
			case "max":
				message = fmt.Sprintf("Must be at most %s characters long", ve.Param())
			case "indialat":
				message = "Latitude must be within India bounds (8 to 37)"
			case "indialng":
				message = "Longitude must be within India bounds (68 to 97)"
			}

			details = append(details, ValidationErrorDetails{
				Field:   field,
				Message: message,
			})
		}
	}
	return details
}
