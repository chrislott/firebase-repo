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
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const stripe = require('stripe')(functions.config().stripe.key);



admin.initializeApp();

const db = admin.firestore();

const app = express();

// Automatically allow cross-origin requests
app.use(cors({ origin: true }));
const main = express();

main.use('/api/v1', app);
main.use(bodyParser.json());


export const webApi = functions.https.onRequest(main);

app.get('/warmup', (request: any, response: any) => {
    console.log('calling warmup');
    response.send('Warming up friend.');

});

app.post('/charge', async (request: any, response: any) => {
    let confim = 'test';
    console.log('calling charge');
    try {
        const { token, tipId } = request.body;
        console.log('calling charge with id: ', tipId);
        console.log('calling charge with id: ', token);
        const docRef = await db.collection('tips').doc(tipId);
        await docRef.get().then((tip: any) => {
            const amount = tip.data().amount * 100;
            const currency = 'USD';
            const source = '';
            const idempotencyKey = tipId;
            const charge = { amount, currency, source };
            if (tip.data().source !== null) {
                charge.source = tip.data().source.token.id;
            }

            stripe.charges.create(charge, { idempotency_key: idempotencyKey }).then(async (res: any) => {
                confim = randomNumber();
                res.confirmCode = confim;
                await docRef.set(res, {
                    merge: true
                });
                response.json({
                    confirmCode: confim
                });
            }

            );

        }
        );

        // const data = { token, tipId };



    } catch (error) {

    }
});


// Take the text parameter passed to this HTTP endpoint and insert it into the
// Realtime Database under the path /messages/:pushId/original
exports.chargeTip = functions.https.onRequest(async (req: any, res: any) => {
    // Grab the text parameter.
    //const original = 465;

    console.log('res', res.toString());


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

// async function createNewCode(): Promise<string> {
//     var codesRef = admin.firestore().collection("codes");
//     var randomize = require('randomatic');
//     //const random = randomize('Aa0', 10);
//     let random = randomize('0');
//     random = random + randomize('A', 3);
//     random = random + randomize('000');
//     var query = codesRef.where("confirmCode", "==", random);
//     const querySnapshot = await query.get();
//     if (querySnapshot.size > 0) {
//         random = randomNumber();
//     }
//     return random;
// }

function addNewCode() {
    randomNumber().then((result: string) => {
        admin.firestore().collection("codes").doc(result).set({
            confirmCode: result,
            tipId: '',
            userd: false
        })
    }

    )
}

async function getNotUsedCode() {
    const codesRef = admin.firestore().collection("codes");
    const query = codesRef.where("used", "==", false);
    const querySnapshot = await query.get();

    return querySnapshot.data().confirmCode;

}

exports.createStripeCharge = functions.firestore.document('tips/{id}').onCreate(async (snap: any, context: any) => {
    // const tip: any = snap.data();
    // Create a charge using the pushId as the idempotency key
    // protecting against double charges
    console.log('data:', snap.data());
    await snap.ref.set({ state: 'Calling Payment Processing', status: 'Waiting' }, {
        merge: true
    });
    console.log('amount: ', snap.data().amount * 100);

    const amount = snap.data().amount * 100;
    const currency = 'USD';
    const source = '';
    const idempotencyKey = context.params.id;
    const charge = { amount, currency, source };
    if (snap.data().source !== null) {
        charge.source = snap.data().source.token.id;
    }


    console.log('source: ', snap.data().source.token.id);
    console.log('idempotency_key: ', idempotencyKey);

    const confirmCode = await getNotUsedCode();
    stripe.charges.create(charge, { idempotency_key: idempotencyKey }).then(async (res: any) => {

        res.confirmCode = confirmCode;
        snap.ref.set(res, {
            merge: true
        })
    }

    );
    addNewCode();
})
    ;