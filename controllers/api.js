import express from "express";
const router=express.Router();
import prisma from  "../prisma/db.js";
import { verifyToken } from "../utilities/auth.js"

//display wallet balance
router.get("/wallet/balance", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).send("unauthorised!")
        }
        req.user = decoded.data;
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
router.post("/wallet/deposit", async (req, res) => {

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
                balance:Math.floor(Number(wallet.balance) + Number(amountToDeposit))
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
router.post("/transfer", async (req, res) => {
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
                balance: Math.floor(Number(senderWallet.balance) - Number(amountToTransfer))
            }
        })


        //add amount to receiver
        const addAmount = await tx.wallet.update({
            where: { accountNumber: receiverAccountNumber },
            data: {
                balance: Math.floor(Number(receiverWallet.balance) + Number(amountToTransfer))
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

//staetement generation
router.get("/statement", async (req, res) => {
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

export default router;