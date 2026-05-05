import * as Joi from 'joi'

export const validationSchema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production').default('development'),
    PORT: Joi.number().default(3000),
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().default(5432),
    DB_USER: Joi.string().required(),
    DB_PASSWORD: Joi.string().required(),
    DB_NAME: Joi.string().required(),
    // Google Calendar
    GOOGLE_SERVICE_ACCOUNT_EMAIL: Joi.string().email().required(),
    GOOGLE_PRIVATE_KEY: Joi.string().required(),
    GOOGLE_CALENDAR_ID: Joi.string().required(),
    // Scheduler
    MORNING_REMINDER_HOUR: Joi.number().min(0).max(23).default(9),
    MORNING_REMINDER_MINUTE: Joi.number().min(0).max(59).default(30),
})