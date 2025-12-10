import app from "./app";
import "dotenv/config";

const PORT = Number(process.env.PORT) || 5000;
const HOST = "0.0.0.0"; 

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});
