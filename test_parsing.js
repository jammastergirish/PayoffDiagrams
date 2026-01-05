
const { cleanNumber } = require('./payoff-web/lib/payoff-utils');

const testCases = [
    "616",
    "24,767",
    "'-7,509", // Note the single quote inside
    "4,964",
    "'-0.3938"
];

testCases.forEach(val => {
    console.log(`Input: "${val}" -> Output: ${cleanNumber(val)}`);
});
