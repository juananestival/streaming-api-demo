const _endpoint = "us-central1-aiplatform.googleapis.com"
const _project = "emea-ccai-demo"
const _location = "us-central1"
// const _url = 'https://' + _endpoint + '/v1beta1/projects/' + _project + '/locations/' + _location + '/publishers/google/models/gemini-2.0-flash-001'
const _url = 'https://' + _endpoint + '/v1beta1/projects/' + _project + '/locations/' + _location + '/publishers/google/models/gemini-1.5-flash-001'

const _fetch_method = 'fetchWebRTCPeerConnectionInfo'
const _exchange_method = 'exchangeWebRTCSessionOffer'

let peerConnection;
let dataChannel;
let screenStream = null;
let screenTrack = null;

function offer_request(offer) {
    return { "sdp_offer": offer }
}

function playAudioFromStream(stream) {
    const audioElement = document.createElement('audio');
    audioElement.srcObject = stream;
    audioElement.autoplay = true;
    document.body.appendChild(audioElement);
}

async function sendHttpRequest(url, method, body, token) {
    const response = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
}

let lastResponseParagraph = null;

async function connect(token) {
    resp = await sendHttpRequest(_url + ':' + _fetch_method, 'POST', {}, token)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    document.getElementById('localVideo').srcObject = stream
    peerConnection = new RTCPeerConnection(resp.serverConfig);
    stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
    });

    dataChannel = peerConnection.createDataChannel("messageChannel");
    dataChannel.onmessage = (event) => {
        peerResponseDiv = document.getElementById('peerResponse');
        const arrayBuffer = event.data;
        // Create a TextDecoder instance to decode the ArrayBuffer
        const decoder = new TextDecoder('utf-8');
        // Convert ArrayBuffer to string
        const text = decoder.decode(arrayBuffer);

        // Parse the message.
        id = text.indexOf(':')
        content_text = text.substring(id + 2)
        prefix = text.substring(0, id)

        // Print it in the webpage.
        if (prefix.endsWith("Transcript")) {
            let p = document.createElement("p");
            p.textContent = "Question: " + content_text;
            peerResponseDiv.appendChild(p);
            lastResponseParagraph = null;
        } else {
            if (lastResponseParagraph === null) {
                // Create a new paragraph if none exists
                lastResponseParagraph = document.createElement("p");
                lastResponseParagraph.textContent += "Answer: "
                peerResponseDiv.appendChild(lastResponseParagraph);
            }

            // Append the new Response text to the existing paragraph
            lastResponseParagraph.textContent += content_text;
        }

        console.log("Received message:", text);
    };

    // Listen to audio.
    peerConnection.ontrack = function (event) {
        // Loop through all the streams in the event
        event.streams.forEach(stream => {
            console.log('Received stream:', stream);

            // Log individual tracks from the stream
            stream.getTracks().forEach(track => {
                console.log('Received track:', track);

                // Check track type
                if (track.kind === 'audio') {
                    console.log('Received audio track');
                    playAudioFromStream(stream)

                } else if (track.kind === 'video') {
                    console.log('Received video track');
                    const remoteVideo = document.createElement('video');
                    remoteVideo.autoplay = true;
                    remoteVideo.playsInline = true;
                    remoteVideo.srcObject = stream;
                    document.body.appendChild(remoteVideo);
                }
            });
        });
    };

    offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)

    answer = await sendHttpRequest(_url + ':' + _exchange_method, 'POST', offer_request(JSON.stringify(offer)), token)
    await peerConnection.setRemoteDescription(JSON.parse(answer.sdpAnswer))
    document.getElementById('connectStatus').textContent = "Connected!";
    return peerConnection
}

async function con() {
    const token = document.getElementById('token').value
    connect(token).then(peer => {
        console.log(peer)
    }).catch(err => {
        console.error(err)
    })
}

async function shareScreen() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        document.getElementById('screenShareVideo').srcObject = screenStream;

        screenTrack = screenStream.getVideoTracks()[0];

        // Replace the existing video track with the screen sharing track
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === screenTrack.kind);
        sender.replaceTrack(screenTrack);

        // Add the onended event listener for the screen track
        screenTrack.onended = () => {
            console.log("Screen sharing ended by user");
            stopShareScreen();
        };

        // Update UI
        document.getElementById('shareScreen').disabled = true;
        document.getElementById('stopShareScreen').disabled = false;
    } catch (err) {
        console.error("Error sharing screen:", err);
    }
}
async function stopShareScreen() {
    if (!screenStream) return;

    // Remove the screen sharing track from the peer connection
    const sender = peerConnection.getSenders().find(s => s.track === screenTrack);
    if (sender) {
        peerConnection.removeTrack(sender);
    }

    // Stop the screen stream
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
    screenTrack = null

    // Update UI
    document.getElementById('shareScreen').disabled = false;
    document.getElementById('stopShareScreen').disabled = true;
    document.getElementById('screenShareVideo').srcObject = null;

    // Reset to local camera.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    const localTrack = stream.getVideoTracks()[0]
    const senderLocal = peerConnection.getSenders().find(s => s.track && s.track.kind === localTrack.kind);
    senderLocal.replaceTrack(localTrack);

    document.getElementById('localVideo').srcObject = stream
}
