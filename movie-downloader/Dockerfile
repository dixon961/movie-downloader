FROM node:20-alpine

WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
# Using --omit=dev for production builds to skip devDependencies
RUN npm install --omit=dev

# Copy the rest of the application code
# This will include src/, public/, etc.
COPY . .

# Expose the application port
EXPOSE 9339

# Command to run the application
# Using the updated entry point from package.json
CMD ["npm", "start"]