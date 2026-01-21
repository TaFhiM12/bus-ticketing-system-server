import cors from "cors";

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "https://bus-ticketing-system-server-1.onrender.com",
  "https://bus-ticketing-system-client-1.onrender.com",
  "https://busvara.netlify.app",
  "https://bus-ticketing-system-51ddb.web.app/"
];

const corsMiddleware = cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});

export default corsMiddleware;