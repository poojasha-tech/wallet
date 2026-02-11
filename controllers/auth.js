import express from 'express' 
const router = express.Router();
import prisma from "../prisma/db.js";
import { hashPassword, jwtToken } from "../utilities/auth.js";

router.get("/", async (req, res) => {
    return res.send("hello!")

})
router.post("/api/register", async (req, res) => {
    try {
        const data = req.body;
        const dataInDb = await prisma.customer.findFirst({ where: { username: data.username, email: data.email } });
        if (dataInDb) {
            return res.status(409).send("username already exists! ")
        }
        else {
            // almost unique
            const accountNumber = Math.floor(10000 + Math.random() * 90000) + parseInt(new Date().getTime().toString().slice(0, -3));
            let user = {};
            const trans = await prisma.$transaction(async (tx) => {
                user = await tx.customer.create({
                    data: {
                        username: data.username,
                        email: data.email,
                        password: hashPassword(data.password),
                        accountNumber: accountNumber
                    }
                })
                const wallet = await tx.wallet.create({
                    data: {
                        balance: 0,
                        accountNumber: accountNumber
                    }
                })
            })

            // console.log(user)
            // return res.status(201).send("user created !")
            user.password = null;
            const token = jwtToken(user);
            return res.status(201).send({ token: token })
        }

    } catch (error) {
        console.error(error)
        return res.status(500).send("something went wrong!")
    }

})

router.post("/api/login", async (req, res) => {
    try {
        const data = req.body;
        const dataInDb = await prisma.customer.findFirst({ where: { username: data.username, email: data.email } });
        if (dataInDb) {
            if (dataInDb.password == hashPassword(data.password)) {
                delete data.password;
                const token = jwtToken(dataInDb);
                return res.status(200).send({ token: token })
            }
            else {
                return res.status(409).send("unauthorised!")
            }
        }
        else {
            return res.status(404).send("Please register !")
        }

    } catch (error) {
        console.log(error);
        return res.status(500).send("Something went wrong !")

    }
})

export default router