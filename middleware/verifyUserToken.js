import { verifyToken } from "../utilities/auth.js";

function verifyUserToken(req, res, next) {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).send("unauthorised!")
        }
        req.user = decoded.data;
        next();
    } catch (error) {
        console.log(error);
        return res.status(500).send("something went wrong")
    }
}  
export default verifyUserToken;