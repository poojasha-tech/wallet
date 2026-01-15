import express from "express";
import cors from "cors";
import crypto from "crypto";
const secret = "bigsecret";
import prisma from "./prisma/db.js"
import jwt from "jsonwebtoken"


const app = express();
app.use(cors());
const port = 3000;
app.use(express.json());



app.get("/helloworld", (req, res) => {
    return res.send("hello world!")
});


app.post("/register", async (req, res) => {
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

app.post("/login", async (req, res) => {
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

//display wallet balance
app.get("/wallet/balance", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).send("unauthorised!")
        }


        const accountNumber = decoded.accountNumber;
        const walletBalance = await prisma.wallet.findFirst({ where: { accountNumber: accountNumber } })
        if (walletBalance) {
            return res.status(200).send({ balance: walletBalance.balance })
        }
        else {
            return res.status(404).send("cannot find wallet")
        }
    } catch (error) {
        console.log(error);
        return res.status(500).send("sonething went wrong")
    }
})

//depositmoney
app.post("/wallet/deposit", async (req, res) => {

    try {
        const accountNumber = req.body.accountNumber;
    const amountToDeposit = req.body.amount;

    if (amountToDeposit <= 0) {
        return res.status().send("amount must be positive!")
    }
    
    const deposit= await prisma.$transaction(async (tx)=>{
        const wallet = await tx.wallet.findUnique({ where: { accountNumber: accountNumber } });
        const updatedWallet = await tx.wallet.update({
            where:{accountNumber:accountNumber},
            data:{
                balance:wallet.balance + amountToDeposit
            }
        })

        const depositTransaction = await tx.trx.create({
            data:{
                amount:amountToDeposit,
                receiverAccountNumber:accountNumber
            }
        })
        return res.status(200).send({updatedWallet,depositTransaction})
    })
        
    } catch (error) {
        console.log(error);
        return res.status(500).send("something went wrong!")
        
    }

})

//money transfer
app.post("/transfer", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).send("unauthorised!")
    }

    const senderAccountNumber = decoded.accountNumber;
    const amountToTransfer = req.body.amount;
    const receiverAccountNumber = req.body.receiverAccountNumber;

    if (amountToTransfer <= 0) {
        return res.status().send("amount must be positive!")
    }

    const senderWallet = await prisma.wallet.findUnique({ where: { accountNumber: senderAccountNumber } });
    if (!senderWallet || senderWallet.balance < amountToTransfer) {
        throw new Error("insufficient balance!")
    }


    let transactionRecord = {}


    const transfer = await prisma.$transaction(async (tx) => {

        const receiverWallet = await tx.wallet.findUnique({ where: { accountNumber: receiverAccountNumber } });
        if (!receiverWallet) {
            throw new Error("receiver account not found!")
        }

        //deduct amount from sender
        const deductAmount = await tx.wallet.update({
            where: { accountNumber: senderAccountNumber },
            data: {
                balance: senderWallet.balance - amountToTransfer
            }
        })


        //add amount to receiver
        const addAmount = await tx.wallet.update({
            where: { accountNumber: receiverAccountNumber },
            data: {
                balance: receiverWallet.balance + amountToTransfer
            }
        })

        //create transaction record
        transactionRecord = await tx.trx.create({
            data: {
                amount: amountToTransfer,
                senderAccountNumber: senderAccountNumber,
                receiverAccountNumber: receiverAccountNumber
            }

        })
        return { transactionRecord }


    })

    return res.status(200).send(transactionRecord)
})




app.get("/statement", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = verifyToken(token);
    const {startDate,endDate} = req.query; // 2025-12-01 to 2025-12-31
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23,59,59,999); // set to end of the day

    if (!decoded) {
        return res.status(401).send("unauthorised!")
    }

    const accountNumber = decoded.accountNumber;
    const transactions = await prisma.trx.findMany({
        where: {
            OR: [
                { senderAccountNumber: accountNumber },
                { receiverAccountNumber: accountNumber }
            ],
            createdAt: { // createdAt > start and createdAt < end
                gte: start,
                lte: end
            }
        }
    })
    
    let csv = "date,amount,sender,receiver\n"
    transactions.forEach(tx => {
        csv += `${tx.createdAt} , ${tx.amount} , ${tx.senderAccountNumber} , ${tx.receiverAccountNumber} \n`
    });
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
        "Content-Disposition",
        "attachment; filename=statement.csv"
    )
    res.send(csv)
})




function hashPassword(password) {
    const hash = crypto.createHmac('md5', secret).update(password).digest('hex');
    return hash
}

function jwtToken(user) {
    var token = jwt.sign({

        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24),
        data: user,
        accountNumber: user.accountNumber
    },
        secret);
    return token;
}

function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, secret);
        return decoded;
    } catch (error) {
        console.log("invalid token");
        return null;
    }
}


app.listen(port, () => {
    console.log(`app listening on port ${port}!`)
})