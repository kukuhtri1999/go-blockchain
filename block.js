// mengatur perintah get dan all
let logger = require('logger');
function Block(options) {
    this.options = options;
}
Block.DETAILS = {
    alias: 'b',
    description: 'block',
    commands: ['get', 'all'],
    options: {
        create: Boolean
    },
    shorthands: {
        s: ['--get'],
        a: ['--all']
    },
    payload: function(payload, options) {
        options.start = true;
    },
};
Block.prototype.run = function() {
    let instance = this,
        options = instance.options;
    if (options.get) {
        instance.runCmd('curl http://localhost:' + options.argv.original[2] + '/getBlock?index=' + options.argv.original[3]);
    }
    if (options.all) {
        instance.runCmd('curl http://localhost:' + options.argv.original[2] + '/blocks');
    }
};
Block.prototype.runCmd = function(cmd) {
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
exports.Impl = Block;

exports.BlockHeader = class BlockHeader {
    constructor(version, previousBlockHeader, merkleRoot, time) {
        this.version = version; // Version - at the time of writing there are 4 block versions. Version 1 is the genesis block (2009), Version 2 was a soft fork in Bitcoin Core 0.7.0 (2012). Version 3 blocks were a soft fork in Bitcoin Core 0.10.0 (2015). Version 4 blocks are BIP65 in Bitcoin Core 0.11.2 (2015).
        this.previousBlockHeader = previousBlockHeader; // previous block header hash - A SHA256(SHA256()) hash of previous block’s header. Ensures that previous block cannot be changed as this block needs to be changed as well.
        this.merkleRoot = merkleRoot; // merkle root hash - a merkle tree is a binary tree which holds all the hashed pairs of the tree.
        this.time = time; // a Unix epoch time when the miner started hashing the header.
    }
};

exports.Block = class Block {
    constructor(blockHeader, index, txns) {
        this.blockHeader = blockHeader;
        this.index = index; // GenesisBlock is the first block - block 0
        this.txns = txns; // txns is the raw transaction in the block.
    }
}