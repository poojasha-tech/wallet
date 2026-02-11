import crypto from "crypto";
import jwt from "jsonwebtoken";
const secret = "bigsecret";


export function hashPassword(password) {
    const hash = crypto.createHmac('md5', secret).update(password).digest('hex');
    return hash
}

export function jwtToken(user) {
    var token = jwt.sign({

        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24),
        data: user,
        accountNumber: user.accountNumber
    },
        secret);
    return token;
}

export function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, secret);
        return decoded;
    } catch (error) {
        console.log("invalid token");
        return null;
    }
}
