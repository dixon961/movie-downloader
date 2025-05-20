FROM node:20-alpine

WORKDIR /app

# Copy package.json (and package-lock.json if you add it later)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source
COPY . .

EXPOSE 9339
CMD ["node", "src/index.js"]
