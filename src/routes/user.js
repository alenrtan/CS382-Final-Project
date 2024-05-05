const express = require('express');
const router = express.Router();
// Import Plaid Helper Functions
const { fetchTransactionSync, GetTransactionList, GetAccountInfo } = require('./bank.js');
const mongoose = require('mongoose');

global.userID;

//Import user schema
const user = require('../models/user.js');
const settings = require("../models/settings.js");
const bills = require("../models/bills.js");
const account = require("../models/account.js");
const transaction = require("../models/transaction.js");
const bankData = require("../models/bankData.js");

const passwordRegex = /^(?=.*\d)(?=.*[!@#$%^&*])(?=.*[A-Z]).{8,}$/;

router.post('/login', async (req, res) => {
    //find user
    const { email, password } = req.body.user;

    const foundUser = await user.findOne({email});

    // check if the user exists
    if (!foundUser) {
        console.log("User not found, redirecting to login.");
        res.redirect("/pages/login.html?error=userNotFound");
        return;
    }

    // we found a user here, so save the userID 
    global.userID = foundUser._id.toString();
    const userID = global.userID;

    // Check if password is valid
    if (foundUser.validPass(password)) {
        console.log("Login successful; redirected to dashboard.html");
        // throw the userID in the URL
        const redirectURL = `/pages/dashboard.html?userID=${userID}`;
        res.redirect(redirectURL);
        return;
    } else {
        // password is wrong 
        console.log("Wrong password, redirecting to login.");
        res.redirect("/pages/login.html?error=wrongPassword");
        return;
    }
});

//user login api

//user signup api

 router.post('/register', async (req, res) => {
    const {firstName, lastName, userName, email, password, confirmedPassword} = req.body.user;
    const userEmailFound = await user.findOne({email}); // for email check

    // Check if email already exists in the database
    if (userEmailFound != null) {
        console.log("Email already in use. Redirecting to signup.");
        res.redirect("/pages/register.html?error=emailInUse");
        return;
    }

    // Check if passwords match
    if (password !== confirmedPassword) {
        console.log("Passwords do not match. Redirecting to signup.");
        res.redirect("/pages/register.html?error=passwordsDoNotMatch");
        return;
    }

    // Check if password meets the regex requirements
    if (!passwordRegex.test(password)) {
        console.log("Password does not meet requirements. Redirecting to signup.");
        res.redirect("/pages/register.html?error=invalidPassword");
        return;
    }

    
    const newID = new mongoose.Types.ObjectId(); // KEEP THIS SETTING HERE. needed for global.userID
    global.userID = newID;

    const newUser = new user({
        //initialize newUser ID with autogenerated ID
        _id: newID, 
        firstName,
        lastName,
        userName,
        email,
        password,
        confirmedPassword
    });

    //call setPass function to hash password
    newUser.setPass(password);

    //save the new user to the DB
    newUser.save()
        .then(settings => {
            console.log("Registration successful; redirected to dashboard.html");
            res.redirect("/pages/dashboard.html"); // TODO: figure out if we need userID in param here
            return;
        })
        .catch(err => {
            console.error(err);
            res.status(400).send({
                message : "Failed to add new user"
            });
    });

    // Create settings document for the user
    const newSettings = new settings({
        // Link the settings to the user
        userID: newUser._id
    });

    const newBills = new bills({
        userID: newUser._id
    });

    newSettings.save();
    newBills.save();

    // Generate bank data and save to mongoDB
    const accountDocuments = [];
    const transactionDocuments = [];
    fetchTransactionSync().then(transactionSyncResponse => {
        // Fetching Account Plaid Info
        let accountData = GetAccountInfo(transactionSyncResponse.accounts);
        for(let i = 0; i < accountData.length; i++){
            let currentAccountData = accountData[i];
            const newAccount = new account({
                userID: newUser._id, // Link the account to the user
                accountID: currentAccountData.account_id,
                accountName: currentAccountData.account_name,
                subtype: currentAccountData.subtype,
                current_balance_available: currentAccountData.current_balance_available
            });
            newAccount.save();
            accountDocuments.push(newAccount);
        }

        // Fetching Transactions Plaid Info
        let transactionData = GetTransactionList(transactionSyncResponse.added);
        for(let i = 0; i < transactionData.length; i++){
            let currentTransactionData = transactionData[i];
            const newTransaction = new transaction({
                userID: newUser._id, // Link the transaction to the user
                date: currentTransactionData.date,
                merchantName: currentTransactionData.merchantName,
                cost: currentTransactionData.cost,
                category: currentTransactionData.category
            });
            newTransaction.save();
            transactionDocuments.push(newTransaction);
        }

        // Create bankData document
        const newBankData = new bankData({
            userID: newUser._id,
            accounts: accountDocuments,
            transactions: transactionDocuments
        });

        newBankData.save();
    })
    .catch(error => {
        console.error(error);
    });
    
});
router.get('/logout', (req, res) => {
    console.log("Logged out successfully.");
    res.redirect('/pages/login.html?message=loggedout');
});



module.exports = router; 