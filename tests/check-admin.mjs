import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

await mongoose.connect(process.env.MONGODB_URI);
const admin = await mongoose.connection.db.collection("users").findOne({email: "testadmin@test.com"});
console.log("Admin found:", admin ? "YES" : "NO");
console.log("Admin status:", admin?.status);
console.log("Admin userType:", admin?.userType);
console.log("Admin isDeleted:", admin?.isDeleted);
console.log("Has password:", admin?.password ? "YES" : "NO");

const p1 = await bcrypt.compare("TestAdmin123!", admin?.password || "");
console.log("Password TestAdmin123! matches:", p1);

const p2 = await bcrypt.compare("admin123!@#", admin?.password || "");
console.log("Password admin123!@# matches:", p2);

const allAdmins = await mongoose.connection.db.collection("users").find({userType: "admin"}).project({email:1, status:1, isDeleted:1}).toArray();
console.log("All admins:", JSON.stringify(allAdmins));

// Check Redis
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const resp = await fetch(`${redisUrl}/ping`, {
    headers: { Authorization: `Bearer ${redisToken}` }
  });
  const data = await resp.json();
  console.log("Redis ping:", JSON.stringify(data));
} catch(e) {
  console.log("Redis error:", e.message);
}

await mongoose.disconnect();
