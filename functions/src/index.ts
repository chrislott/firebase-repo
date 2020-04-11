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

// Get the `FieldValue` object





admin.initializeApp();

const db = admin.firestore();

const app = express();

// Automatically allow cross-origin requests
app.use(cors({ origin: true }));
const main = express();

main.use('/api/v1', app);
main.use(bodyParser.json());


export const webApi = functions.https.onRequest(main);

interface Tip {
    confirmCode: String
};

// Match the raw body to content type application/json
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), (request: any, response: any) => {
    console.log('calling webhook: ');
    let event;

    try {
        event = request.body;
    } catch (err) {
        response.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            // Then define and call a method to handle the successful payment intent.
            // handlePaymentIntentSucceeded(paymentIntent);
            console.log('succeded: ', paymentIntent)
            break;
        case 'payment_method.attached':
            const paymentMethod = event.data.object;
            // Then define and call a method to handle the successful attachment of a PaymentMethod.
            // handlePaymentMethodAttached(paymentMethod);
            console.log('attached: ', paymentMethod)
            break;
        // ... handle other event types
        default:
            // Unexpected event type
            console.log('fail: ', paymentIntent)
            return response.status(400).end();
    }

    // Return a response to acknowledge receipt of the event
    response.json({ received: true });
});


app.post('/intents', async (request: any, response: any) => {
    const { amount } = request.body;
    const { email } = request.body;
    const { name } = request.body;
    console.log('calling intents with email: ', email , ' name: ', name, ' amount: ', amount);
    let confirmCode = "";
    
    const confirmCodesRef = admin.firestore().collection(`confirmCodes`);

    const query = confirmCodesRef.where("used", "==", false).limit(1);

    await query.get().then((querySnapshot: any) => {
        querySnapshot.forEach(function (doc: any) {
           
            console.log(doc.confirmCode, " => ", doc.data());
            confirmCode = doc.data().confirmCode;

            const docRef = admin.firestore().collection(`confirmCodes`).doc(confirmCode);
            return admin.firestore().runTransaction(function (transaction: any) {
                // This code may get re-run multiple times if there are conflicts.
                console.log("Starting transaction");
                return transaction.get(docRef).then(function (ccDoc: any) {
                    if (!ccDoc.exists) {
                        throw new Error("Document does not exist!");
                    }

                    transaction.update(docRef, { used: true });
                    confirmCode = docRef.confirmCode;
                });
            }).then(function () {
                console.log("Transaction successfully committed!");
            }).catch(function (error: any) {
                console.log("Transaction failed: ", error);

            });
        });
    })


    if (confirmCode !== '') {
        console.log('using confirm code: ', confirmCode)
        const localConfirmCode = confirmCode
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: 'usd',
            payment_method_types: ['card'],
            metadata: { confirmCode: localConfirmCode }
        });

        const tipsRef = admin.firestore().collection(`tips`);

        tipsRef.add({
            client_secret: paymentIntent.client_secret,
            payment_Intent: paymentIntent.id,
            amount: amount,
            currency: 'usd',
            tipperEmail: email,
            tipperName: name,
            tipTime: admin.firestore.FieldValue.serverTimestamp(),
            state: 'Calling Payment Processing', 
            status: 'Waiting'
        }).then((doc: any) => {
            console.log("Document written with ID: ", doc.id);
        });

        console.log('response successfull with confirmCode: ', localConfirmCode)
        response.json({
            secret: paymentIntent.client_secret,
            confirmCode: localConfirmCode
        });
    }

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



    } catch (error) {

    }
});

app.post('/charge1', async (request: any, response: any) => {
    let confim = 'test';
    console.log('calling charge');
    try {
        const { tip } = request.body;
        console.log('calling charge with id: ', tip);

        const docRef = await db.collection('tips');

        await docRef.add(JSON.parse(JSON.stringify(tip))).then(async (obj: any) => {
            console.log("Document written with ID: ", obj.id);
            const amount = tip.amount * 100;
            const currency = 'USD';
            const source = '';
            const idempotencyKey = obj.id;
            const charge = { amount, currency, source };
            if (tip.source !== null) {
                charge.source = tip.source.token.id;
            }

            await stripe.charges.create(charge, { idempotency_key: idempotencyKey }).then(async (res: any) => {
                if (res.outcome.network_status === 'approved_by_network') {
                    confim = randomNumber();
                    res.confirmCode = confim;
                    await obj.set(res, {
                        merge: true
                    });
                    response.json({
                        confirmCode: confim
                    });
                }
            }

            );
        });

        // const data = { token, tipId };



    } catch (error) {

    }
});

app.post('/collect', async (request: any, response: any) => {
    // console.log('collect got called with request: ', request);
    try {
        // const tip { tip } = request.body;
        const tip: Tip = {
            confirmCode: request.body['confirmCode']
        }
        console.log('calling charge with body 0 : ', request.body);
        console.log('calling charge with body: ', request.body['confirmCode']);

        const tipsRef = admin.firestore().collection("tips");

        const query = tipsRef.where('confirmCode', "==", tip.confirmCode);
        query.get().then(function (querySnapshot: any) {
            querySnapshot.forEach((element: any) => {
                console.log('confirmCode: ', element.id);
                tipsRef.doc(element.id).set({ uid: 'ererer' },
                    {
                        merge: true
                    });
            });
            response.json({
                status: 'Success'
            });
        }).catch((error: any) => {
            console.log('errr', error)
            response.json({
                status: 'No data Found'
            });
        })


    } catch (error) {

    }

});


// Take the text parameter passed to this HTTP endpoint and insert it into the
// Realtime Database under the path /messages/:pushId/original
exports.chargeTip = functions.https.onRequest(async (req: any, res: any) => {
    // Grab the text parameter.
    //const original = 465;

    console.log('res', res.toString());


    const mesRef = admin.firestore().collection(`messages`);

    mesRef.add({
        name: "test"
    }).then((docRef: any) => {
        console.log("Document written with ID: ", docRef.id);
    });

    const citiesRef = admin.firestore().collection("cities");

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
    if (req.method === 'OPTIONS') {
        // Send response to OPTIONS requests
        res.set('Access-Control-Allow-Methods', 'GET');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Max-Age', '3600');
        res.status(200).json({ confirmCode: "123456" });

    }
    res.status(200).json({ confirmCode: randomNumber() });
});

function randomNumber() {
    const tipsRef = admin.firestore().collection("tips");
    const randomize = require('randomatic');
    //const random = randomize('Aa0', 10);
    let random = randomize('0');
    random = random + randomize('A', 3);
    random = random + randomize('000');
    const query = tipsRef.where("confirmCode", "==", random);
    const querySnapshot = query.get();
    if (querySnapshot.size > 0) {
        random = randomNumber();
    }
    return random;
};



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
//remove this
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
});


exports.scheduledFunction = functions.pubsub.schedule('every 60 minutes').onRun(async (context: any) => {
    console.log('This will be run every 60 minutes');

    const confirCodes = admin.firestore().collection("confirmCodes");

    const query = confirCodes.where("used", "==", false);

    const querySnapshot = await query.get();
    console.log('randomConfirmNumber -- got query result size: ', querySnapshot.size);
    if (querySnapshot.size < 25) {
        for (let i = 0; i < 25; i++) {

            console.log('call randomConfirmNumber: ', i);
            randomConfirmNumber()
                .then(async (result: string) => {
                    console.log('randomConfirmNumber -- confirmCode: ', result);
                    await admin.firestore().collection("confirmCodes").doc(result).set({
                        confirmCode: result,
                        tipId: '',
                        used: false
                    });
                    console.log('randomConfirmNumber -- added code: ', result);
                })
                .catch(err =>
                    console.log('end randomConfirmNumber: ', err));

            console.log('end randomConfirmNumber: ', i);
        }

    }
    else {
        console.log('randomConfirmNumber -- exit: ');
    }

    return null;
});

async function randomConfirmNumber() {
    console.log('Calling randome');
    const confirmCodesRef = admin.firestore().collection("confirmCodes");
    const randomize = require('randomatic');
    //const random = randomize('Aa0', 10);
    let random = randomize('0');
    random = random + randomize('A', 3);
    random = random + randomize('000');
    const query = confirmCodesRef.where("code", "==", random);
    const querySnapshot = await query.get();
    if (querySnapshot.size > 0) {
        console.log('conflict randomConfirmNumber: ', random);
        random = randomConfirmNumber();
    }
    return random;
}