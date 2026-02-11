import express from "express";
import cors from "cors";
import api from "./controllers/api.js";
import authRoutes from "./controllers/auth.js";
import verifyUserToken from "./middleware/verifyUserToken.js"
const port = 3000;
const app = express();

app.use(cors());
app.use(express.json());   // body parsing middleware


app.use(authRoutes);        // auth routes do not require token verification
app.use(verifyUserToken);   // all routes below this line will require token verification
app.use(api);
  

app.listen(port, () => {
    console.log(`app listening on port ${port}!`)
})