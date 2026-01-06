const Joi = require('joi');

const envVarsSchema = Joi.object({
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
    PORT: Joi.number()
        .default(5000),
    MONGODB_URI: Joi.string()
        .required()
        .description('MongoDB connection string'),
    JWT_SECRET: Joi.string()
        .required()
        .description('JWT secret key'),
    JWT_EXPIRE: Joi.string()
        .default('7d')
        .description('JWT expiration time'),
    CLIENT_URL: Joi.string()
        .default('http://localhost:3000')
        .description('Frontend client URL'),
    MAX_FILE_SIZE: Joi.number()
        .default(5)
        .description('Max file size in MB'),
    UPLOAD_PATH: Joi.string()
        .default('./uploads')
        .description('File upload directory'),
}).unknown();

const { value: envVars, error } = envVarsSchema.validate(process.env);

if (error) {
    throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
    env: envVars.NODE_ENV,
    port: envVars.PORT,
    mongoose: {
        url: envVars.MONGODB_URI,
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
    },
    jwt: {
        secret: envVars.JWT_SECRET,
        expire: envVars.JWT_EXPIRE,
    },
    clientUrl: envVars.CLIENT_URL,
    upload: {
        maxSize: envVars.MAX_FILE_SIZE * 1024 * 1024, // Convert MB to bytes
        path: envVars.UPLOAD_PATH,
    },
};