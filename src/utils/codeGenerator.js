const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_LENGTH = 5;

const generateCode = (existingCodes = new Set(), length = DEFAULT_LENGTH) => {
  let code = "";
  let attempts = 0;

  do {
    code = Array.from(
      { length },
      () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    ).join("");
    attempts += 1;
  } while (existingCodes.has(code) && attempts < 25);

  if (existingCodes.has(code)) {
    throw new Error("Failed to generate a unique lobby code.");
  }

  return code;
};

module.exports = {
  generateCode,
};
