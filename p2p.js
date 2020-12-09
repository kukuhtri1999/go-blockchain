// ini adalah import statement yang merupakan awalan dari p2p
const crypto = require('crypto'),
    Swarm = require('discovery-swarm'),
    defaults = require('dat-swarm-defaults'),
    getPort = require('get-port'),
    // import class dari chain.js
    chain =  require("./chain"),
    // import dari cron library npm
    CronJob = require('cron').CronJob,
    // import wallet js
    express = require("express"),
    bodyParser = require('body-parser'),
    wallet = require('./wallet');

// ini adalah objek untuk menyimpan ID peer node sebagai penghubung p2p connection
const peers = {};
let connSeq = 0;
let channel = 'myBlockchain';

// melacak penambang terdaftar serta siapa yang menambang blok terakhir sehingga Anda dapat menetapkan blok berikutnya ke penambang berikutnya
let registeredMiners = [];
let lastBlockMinedBy = null;

// untuk me-request dan menerima blok terbaru. MessageType = membuat sebuah sakelar agar
// saat mengirim tipe pesan berbeda akan menggunakan fungsi yang berbeda pula
let MessageType = {
    // REQUEST_LATEST_BLOCK: 'requestLatestBlock',
    // LATEST_BLOCK: 'latestBlock',
    REQUEST_BLOCK: 'requestBlock',
    RECEIVE_NEXT_BLOCK: 'receiveNextBlock',
    RECEIVE_NEW_BLOCK: 'receiveNewBlock',
    REQUEST_ALL_REGISTER_MINERS: 'requestAllRegisterMiners',
    REGISTER_MINER: 'registerMiner'
};

const myPeerId = crypto.randomBytes(32);
console.log('myPeerId: ' + myPeerId.toString('hex'));

// menyimpan peerID ke levelDB
chain.createDb(myPeerId.toString('hex'));

// inisialisasi server dan membuat sebuah layanan
let initHttpServer = (port) => {
    let http_port = '80' + port.toString().slice(-2);
    let app = express();
    app.use(bodyParser.json());
    app.get('/blocks', (req, res) => res.send(JSON.stringify( chain.blockchain ))); // Blocks = mengambil semua blok
    app.get('/getBlock', (req, res) => { // getBlock = mengambil satu blok berdasarkan indeks
        let blockIndex = req.query.index;
        res.send(chain.blockchain[blockIndex]);
    });
    app.get('/getDBBlock', (req, res) => { // getDBBlock = mengambil entri database LevelDB berdasarkan indeks
        let blockIndex = req.query.index;
        chain.getDbBlock(blockIndex, res);
    });
    app.get('/getWallet', (req, res) => { // getWallet = dari wallet js untuk membuat pasangan public-private keys
        res.send(wallet.initWallet());
    });
    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};


// ini adalah library swarm (discovery-swarm) membuat kumpulan jaringan yang menggunakan pustaka saluran penemuan untuk
// menemukan dan menghubungkan rekan di jaringan UCP / TCP
const config = defaults({
    id: myPeerId,
});
const swarm = Swarm(config);

// ini adalah fungsi untuk memonitar swarm. menerima koneksi dari segala peer lain yang ada dan setKeepAlive menjaga agar
// koneksi tetap terhubung
(async () => {
    const port = await getPort();
    initHttpServer(port);
    swarm.listen(port);
    console.log('Listening port: ' + port);
    swarm.join(channel);
    swarm.on('connection', (conn, info) => {
        const seq = connSeq;
        const peerId = info.id.toString('hex');
        console.log(`Connected #${seq} to peer: ${peerId}`);
        if (info.initiator) {
            try {
                conn.setKeepAlive(true, 600);
            } catch (exception) {
                console.log('exception', exception);
            }
        }

        // ini mengurai data menggunakan JSON.parse, yang merupakan perintah native Node.js men-dekode string ke bentuk objek
        // toString mongkenversi bytes ke string yang bisa dibaca

        conn.on('data', data => {
            let message = JSON.parse(data);
            console.log('----------- Received Message start -------------');
            console.log(
                'from: ' + peerId.toString('hex'),
                'to: ' + peerId.toString(message.to),
                'my: ' + myPeerId.toString('hex'),
                'type: ' + JSON.stringify(message.type)
            );
            console.log('----------- Received Message end -------------');

            // kode sakelar untuk menangani berbagai jenis permintaan
            switch (message.type) {
                case MessageType.REQUEST_BLOCK:
                    console.log('-----------REQUEST_BLOCK-------------');
                    let requestedIndex = (JSON.parse(JSON.stringify(message.data))).index;
                    let requestedBlock = chain.getBlock(requestedIndex);
                    if (requestedBlock)
                        writeMessageToPeerToId(peerId.toString('hex'), MessageType.RECEIVE_NEXT_BLOCK, requestedBlock);
                    else
                        console.log('No block found @ index: ' + requestedIndex);
                    console.log('-----------REQUEST_BLOCK-------------');
                    break;
                case MessageType.RECEIVE_NEXT_BLOCK:
                    console.log('-----------RECEIVE_NEXT_BLOCK-------------');
                    chain.addBlock(JSON.parse(JSON.stringify(message.data)));
                    console.log(JSON.stringify(chain.blockchain));
                    let nextBlockIndex = chain.getLatestBlock().index+1;
                    console.log('-- request next block @ index: ' + nextBlockIndex);
                    writeMessageToPeers(MessageType.REQUEST_BLOCK, {index: nextBlockIndex});
                    console.log('-----------RECEIVE_NEXT_BLOCK-------------');
                    break;
                case MessageType.RECEIVE_NEW_BLOCK:
                    if ( message.to === myPeerId.toString('hex') && message.from !== myPeerId.toString('hex')) {
                        console.log('-----------RECEIVE_NEW_BLOCK------------- ' + message.to);
                        chain.addBlock(JSON.parse(JSON.stringify(message.data)));
                        console.log(JSON.stringify(chain.blockchain));
                        console.log('-----------RECEIVE_NEW_BLOCK------------- ' + message.to);
                    }
                    break;

                    // tetap memantau daftar penambang dan menangani pesan ketika blok baru tercipta
                case MessageType.REQUEST_ALL_REGISTER_MINERS:
                    console.log('-----------REQUEST_ALL_REGISTER_MINERS------------- ' + message.to);
                    writeMessageToPeers(MessageType.REGISTER_MINER, registeredMiners);
                    registeredMiners = JSON.parse(JSON.stringify(message.data));
                    console.log('-----------REQUEST_ALL_REGISTER_MINERS------------- ' + message.to);
                    break;
                case MessageType.REGISTER_MINER:
                    console.log('-----------REGISTER_MINER------------- ' + message.to);
                    let miners = JSON.stringify(message.data);
                    registeredMiners = JSON.parse(miners);
                    console.log(registeredMiners);
                    console.log('-----------REGISTER_MINER------------- ' + message.to);
                    break;
            }

        });

        // indikasi apabila koneksi terputus antar peer
        conn.on('close', () => {

            // menghapus miner dari daftar miner ketika miner terputus
            console.log(`Connection ${seq} closed, peerId: ${peerId}`);
            if (peers[peerId].seq === seq) {
                delete peers[peerId];
                console.log('--- registeredMiners before: ' + JSON.stringify(registeredMiners));
                let index = registeredMiners.indexOf(peerId);
                if (index > -1)
                    registeredMiners.splice(index, 1);
                console.log('--- registeredMiners end: ' + JSON.stringify(registeredMiners));
            }
        });
        if (!peers[peerId]) {
            peers[peerId] = {}
        }
        peers[peerId].conn = conn;
        peers[peerId].seq = seq;
        connSeq++
    })
})();

// fungsi mengirim pesan ke peer lain
writeMessageToPeers = (type, data) => {
    for (let id in peers) {
        console.log('-------- writeMessageToPeers start -------- ');
        console.log('type: ' + type + ', to: ' + id);
        console.log('-------- writeMessageToPeers end ----------- ');
        sendMessage(id, type, data);
    }
};

// mengirim pesan ke satu peer spesifik
writeMessageToPeerToId = (toId, type, data) => {
    for (let id in peers) {
        if (id === toId) {
            console.log('-------- writeMessageToPeerToId start -------- ');
            console.log('type: ' + type + ', to: ' + toId);
            console.log('-------- writeMessageToPeerToId end ----------- ');
            sendMessage(id, type, data);
        }
    }
};

// berguna apabila ingin membagikan blok blockchain. Fungsi asli JSON.stringify untuk menyandikan pesan Anda sebelum membagikannya melalui jaringan P2P
sendMessage = (id, type, data) => {
    peers[id].conn.write(JSON.stringify(
        {
            to: id,
            from: myPeerId,
            type: type,
            data: data
        }
    ));
};

// // permintaan batas waktu yang akan mengirim permintaan untuk mengambil blok terbaru setiap 5.000 milidetik (5 detik).
// setTimeout(function(){
//     writeMessageToPeers(MessageType.REQUEST_BLOCK, {index: chain.getLatestBlock().index+1});
// }, 5000);

// permintaan batas waktu yang akan mengirim permintaan untuk menampilkan daftar miner terbaru setiap 5.000 milidetik (5 detik).
setTimeout(function(){
    writeMessageToPeers(MessageType.REQUEST_ALL_REGISTER_MINERS, null);
}, 5000);

// fungsi mendaftarkan peerId sendiri sebagai miner
setTimeout(function(){
    registeredMiners.push(myPeerId.toString('hex'));
    console.log('----------Register my miner --------------');
    console.log(registeredMiners);
    writeMessageToPeers(MessageType.REGISTER_MINER, registeredMiners);
    console.log('---------- Register my miner --------------');
}, 7000);

// menghasilkan blok tiap 30 detik. cron membuat job di eksekusi setiap 30detik
const job = new CronJob('30 * * * * *', function() {
    let index = 0; // first block
    if (lastBlockMinedBy) {
        // blok pertama diberi index 0. setelahnya akan meminta blok berikutnya dari penambang Anda berikutnya.
        let newIndex = registeredMiners.indexOf(lastBlockMinedBy);
        index = ( newIndex+1 > registeredMiners.length-1) ? 0 : newIndex + 1;
    }
    lastBlockMinedBy = registeredMiners[index];
    console.log('-- REQUESTING NEW BLOCK FROM: ' + registeredMiners[index] + ', index: ' + index);
    console.log(JSON.stringify(registeredMiners));
    if (registeredMiners[index] === myPeerId.toString('hex')) {
        console.log('-----------create next block -----------------');
        // untuk menghasilkan blok baru dan menyiarkan blok baru ke peer yang terhubung jaringan
        let newBlock = chain.generateNextBlock(null);
        chain.addBlock(newBlock);
        console.log(JSON.stringify(newBlock));
        writeMessageToPeers(MessageType.RECEIVE_NEW_BLOCK, newBlock);
        console.log(JSON.stringify(chain.blockchain));
        console.log('-----------create next block -----------------');
    }
});
job.start();