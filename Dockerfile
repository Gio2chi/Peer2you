FROM node:16

# Create app directory
WORKDIR /usr/src/peer2you

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

CMD ["node", "main.js"]