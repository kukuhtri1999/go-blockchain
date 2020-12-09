// inisialisasi Elliptical curve cryptography (ECC)
let EC = require('elliptic').ec,
    fs = require('fs');
const ec = new EC('secp256k1'),
    privateKeyLocation = __dirname + '/wallet/private_key'; // inisialisasi lokasi private key

// include a create method and a curl command to run the HTTP service call
let logger = require('logger');
function Wallet(options) {
    this.options = options;
}
Wallet.DETAILS = {
    alias: 'w',
    description: 'wallet',
    commands: ['create'],
    options: {
        create: Boolean
    },
    shorthands: {
        c: ['--create']
    },
    payload: function(payload, options) {
        options.start = true;
    },
};
Wallet.prototype.run = function() {
    let instance = this,
        options = instance.options;
    if (options.create) {
        instance.runCmd('curl http://localhost:' + options.argv.original[2] + '/getWallet');
    }
};
Wallet.prototype.runCmd = function(cmd) {
    const { exec } = require('child_process');
    logger.log(cmd);
    exec(cmd, (err, stdout, stderr) => {
        if (err) {
            logger.log(`err: ${err}`);
            return;
        }
        logger.log(`stdout: ${stdout}`);
    });
};
exports.Impl = Wallet;

exports.initWallet = () => {
    let privateKey;
    if (fs.existsSync(privateKeyLocation)) { //menghasilkan wallet apabila tidak ada wallet
        const buffer = fs.readFileSync(privateKeyLocation, 'utf8');
        privateKey = buffer.toString();
    } else {
        privateKey = generatePrivateKey();
        fs.writeFileSync(privateKeyLocation, privateKey);
    }
    const key = ec.keyFromPrivate(privateKey, 'hex');
    const publicKey = key.getPublic().encode('hex');
    return({'privateKeyLocation': privateKeyLocation, 'publicKey': publicKey});
};

// generate public-private key yang sebenarnya
const generatePrivateKey = () => {
    const keyPair = ec.genKeyPair();
    const privateKey = keyPair.getPrivate();
    return privateKey.toString(16);
};

// let wallet = this;
// let retVal = wallet.initWallet();
// console.log(JSON.stringify(retVal));