import { auth, db } from "./firebase.js";

import {
    collection,
    deleteField,
    getDocs,
    updateDoc
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    createPasswordHash
}
from "./password-security.js";

/*=========================================
      LEGACY PASSWORD MIGRATION

      This utility never runs automatically.
      Run it manually only from an authenticated
      admin browser session.
=========================================*/

async function runLegacyPasswordMigration(options = {}) {

    if (options.confirmMigration !== true) {

        throw new Error(
            "Set confirmMigration to true to run the password migration."
        );

    }

    if (!auth.currentUser) {

        throw new Error(
            "An authenticated admin session is required."
        );

    }

    const querySnapshot = await getDocs(
        collection(db, "customers")
    );

    let migratedCustomers = 0;
    let skippedCustomers = 0;

    for (const customerDoc of querySnapshot.docs) {

        const customer = customerDoc.data();

        if (!customer.password || customer.passwordHash) {

            skippedCustomers++;

            continue;

        }

        const passwordHash =
        await createPasswordHash(customer.password);

        await updateDoc(customerDoc.ref, {
            passwordHash,
            password: deleteField()
        });

        migratedCustomers++;

    }

    return {
        migratedCustomers,
        skippedCustomers
    };

}

export {
    runLegacyPasswordMigration
};
