// import * as functions from 'firebase-functions';



// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.key);



admin.initializeApp();


// Take the text parameter passed to this HTTP endpoint and insert it into the
// Realtime Database under the path /messages/:pushId/original
exports.chargeTip = functions.https.onRequest(async (req: any, res: any) => {
    // Grab the text parameter.
    //const original = 465;



    let mesRef = admin.firestore().collection(`messages`);

    mesRef.add({
        name: "test"
    }).then((docRef: any) => {
        console.log("Document written with ID: ", docRef.id);
    });

    var citiesRef = admin.firestore().collection("cities");

    citiesRef.doc("SF").set({
        name: "San Francisco", state: "CA", country: "USA",
        capital: false, population: 860000,
        regions: ["west_coast", "norcal"]
    });



    let snapshot;
    await admin.firestore().collection(`messages`).
        doc('vrf36BOkcQFuD54sXZn8').
        get().
        then((data: any) => {
            snapshot = data.data();
            console.log('data:', data.data());
        });


    // Push the new message into the Realtime Database using the Firebase Admin SDK.
    //const snapshot = await admin.database().ref('/messages').push({original: original});
    // Redirect with 303 SEE OTHER to the URL of the pushed object in the Firebase console.
    res.status(200).send(snapshot);
    //   res.redirect(303, snapshot.ref.toString());
});



exports.getConfirmation = functions.https.onRequest(async (req: any, res: any) => {
    res.header('Content-Type', 'application/json');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    //respond to CORS preflight requests
    if (req.method == 'OPTIONS') {
        // Send response to OPTIONS requests
        res.set('Access-Control-Allow-Methods', 'GET');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Max-Age', '3600');
        res.status(200).json({ confirmCode: "123456" });

    }
    res.status(200).json({ confirmCode: randomNumber() });
});

function randomNumber() {
    var tipsRef = admin.firestore().collection("tips");
    var randomize = require('randomatic');
    //const random = randomize('Aa0', 10);
    let random = randomize('0');
    random = random + randomize('A', 3);
    random = random + randomize('000');
    var query = tipsRef.where("confirmCode", "==", random);
    const querySnapshot = query.get();
    if (querySnapshot.size > 0) {
        random = randomNumber();
    }
    return random;
};

exports.createStripeCharge = functions.firestore.document('tips/{id}').onCreate(async (snap: any, context: any) => {
    const tip: any = snap.data();
        // Create a charge using the pushId as the idempotency key
        // protecting against double charges
        await snap.ref.set({state:'CSP', status:'WAT'}, {
            merge: true
        })

        const amount = tip.amount;
        const corrency = 'USD';
        const source = '';
        const idempotencyKey = tip.id;
        const charge = { amount, corrency, source};
        if (tip.source !== null) {
            charge.source = tip.source.token.id;
        }

       const response =  stripe.charges.create( {
           amount:1000,
           corrency:'USD',
           source: tip.source.token.id,
           idempotency_key: idempotencyKey });

        await snap.ref.set(response, {
            merge: true
        })
})
;