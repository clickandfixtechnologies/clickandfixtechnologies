/*=========================================
      PASSWORD SECURITY UTILITIES
=========================================*/

const PASSWORD_HASH_ITERATIONS = 210000;

function getRandomValues(length) {

    const values = new Uint8Array(length);

    crypto.getRandomValues(values);

    return values;

}

function getRandomCharacter(characters) {

    const randomValue = getRandomValues(1)[0];

    return characters[randomValue % characters.length];

}

function shuffleCharacters(characters) {

    for (let index = characters.length - 1; index > 0; index--) {

        const randomValue = getRandomValues(1)[0];
        const swapIndex = randomValue % (index + 1);

        [characters[index], characters[swapIndex]] =
        [characters[swapIndex], characters[index]];

    }

    return characters;

}

function bytesToBase64(bytes) {

    let binary = "";

    bytes.forEach(byte => {

        binary += String.fromCharCode(byte);

    });

    return btoa(binary);

}

/*=========================================
      Strong Temporary Password
=========================================*/

function generateTemporaryPassword() {

    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const number = "0123456789";
    const special = "@#$%&*!?";
    const all = upper + lower + number + special;

    const characters = [
        "C",
        "F",
        "@",
        getRandomCharacter(upper),
        getRandomCharacter(lower),
        getRandomCharacter(number)
    ];

    while (characters.length < 14) {

        characters.push(getRandomCharacter(all));

    }

    return shuffleCharacters(characters).join("");

}

/*=========================================
      PBKDF2 Password Hash
=========================================*/

async function createPasswordHash(password) {

    const encoder = new TextEncoder();
    const salt = getRandomValues(16);

    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const hashBuffer = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt,
            iterations: PASSWORD_HASH_ITERATIONS,
            hash: "SHA-256"
        },
        key,
        256
    );

    return [
        "pbkdf2_sha256",
        PASSWORD_HASH_ITERATIONS,
        bytesToBase64(salt),
        bytesToBase64(new Uint8Array(hashBuffer))
    ].join("$");

}

export {
    createPasswordHash,
    generateTemporaryPassword
};
