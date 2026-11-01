
const shareButton = document.getElementById("shareButton");
const watchButton = document.getElementById("watchButton");

const inviteInput = document.getElementById("inviteInput");
const roomCode = document.getElementById("roomCode");

const resolutionSelect = document.getElementById("resolutionSelect");
const fpsSelect = document.getElementById("fpsSelect");
const shareAudio = document.getElementById("shareAudio");

const homeSection = document.getElementById("homeSection");
const studioSection = document.getElementById("studioSection");

const localVideo = document.getElementById("localVideo");
const localPlaceholder = document.getElementById("localPlaceholder");

const remoteVideo = document.getElementById("remoteVideo");
const remoteContainer = document.getElementById("remoteContainer");
const viewerPlaceholder = document.getElementById("viewerPlaceholder");

const viewerStatus = document.getElementById("viewerStatus");
const localResolution = document.getElementById("localResolution");
const localFps = document.getElementById("localFps");
const localAudioStatus = document.getElementById("localAudioStatus");

const pauseButton = document.getElementById("pauseButton");
const pauseLabel = document.getElementById("pauseLabel");

const audioButton = document.getElementById("audioButton");
const audioLabel = document.getElementById("audioLabel");

const stopButton = document.getElementById("stopButton");
const copyInviteButton = document.getElementById("copyInviteButton");
const fullscreenButton = document.getElementById("fullscreenButton");

const liveIndicator = document.getElementById("liveIndicator");


// ==================================================
// ESTADO
// ==================================================

let activePeer = null;
let localStream = null;
let remoteStream = null;

let videoSender = null;
let videoTrack = null;
let audioTrack = null;

let activeRole = null;
let isPaused = false;
let isAudioEnabled = true;


// ==================================================
// WEBRTC
// ==================================================

const ICE_SERVERS = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
};


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function setStatus(message) {
    viewerStatus.textContent = message;
}


function setStudioVisible(visible) {
    studioSection.hidden = !visible;
}


function setViewerVisible(visible) {
    document.getElementById("viewer").hidden = !visible;
}


function updateAudioInterface() {

    if (!audioTrack) {

        audioLabel.textContent = "Áudio indisponível";
        audioButton.disabled = true;
        localAudioStatus.textContent = "Áudio: indisponível";

        return;
    }

    audioButton.disabled = false;

    audioLabel.textContent = isAudioEnabled
        ? "Desativar áudio"
        : "Ativar áudio";

    localAudioStatus.textContent = isAudioEnabled
        ? "Áudio: ativado"
        : "Áudio: desativado";
}


function updatePauseInterface() {

    pauseLabel.textContent = isPaused
        ? "Retomar"
        : "Pausar";
}


// ==================================================
// RESOLUÇÃO E FPS
// ==================================================

function getCaptureConstraints() {

    const resolution = resolutionSelect.value;
    const fps = Number(fpsSelect.value);

    const video = {
        frameRate: {
            ideal: fps,
            max: fps
        }
    };

    if (resolution === "1080") {

        video.width = { ideal: 1920 };
        video.height = { ideal: 1080 };

    } else if (resolution === "720") {

        video.width = { ideal: 1280 };
        video.height = { ideal: 720 };

    } else if (resolution === "480") {

        video.width = { ideal: 854 };
        video.height = { ideal: 480 };

    }

    return video;
}


function updateCaptureInformation() {

    if (!videoTrack) return;

    const settings = videoTrack.getSettings();

    if (settings.width && settings.height) {

        localResolution.textContent =
            `${settings.width} × ${settings.height}`;

    }

    const actualFps = settings.frameRate
        ? Math.round(settings.frameRate)
        : Number(fpsSelect.value);

    localFps.textContent = `FPS: ${actualFps}`;
}


// ==================================================
// SALAS E SINALIZAÇÃO
// ==================================================

async function createRoom() {

    const response = await fetch("/api/rooms", {
        method: "POST"
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Não foi possível criar a sala.");
    }

    return data.room_id;
}


async function getSignal(url) {

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok && response.status !== 202) {
        throw new Error(data.error || "Erro ao consultar conexão.");
    }

    return data;
}


async function postSignal(url, sdp) {

    const response = await fetch(url, {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({ sdp })

    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Erro ao enviar conexão.");
    }

    return data;
}


function waitForIceGathering(peer) {

    if (peer.iceGatheringState === "complete") {
        return Promise.resolve();
    }

    return new Promise(resolve => {

        const timeout = setTimeout(resolve, 20000);

        function checkState() {

            if (peer.iceGatheringState === "complete") {

                clearTimeout(timeout);

                peer.removeEventListener(
                    "icegatheringstatechange",
                    checkState
                );

                resolve();
            }
        }

        peer.addEventListener(
            "icegatheringstatechange",
            checkState
        );
    });
}


// ==================================================
// PRÉVIA LOCAL
// ==================================================

function showLocalPreview(stream) {

    localVideo.srcObject = stream;

    localVideo.play().catch(error => {
        console.warn("Erro ao iniciar prévia:", error);
    });

    localVideo.style.display = "block";
    localPlaceholder.style.display = "none";
}


function resetLocalPreview() {

    localVideo.srcObject = null;
    localVideo.style.display = "none";

    localPlaceholder.style.display = "flex";

    localResolution.textContent = "Aguardando captura";
    localFps.textContent = "FPS: --";
    localAudioStatus.textContent = "Áudio: desativado";
}


// ==================================================
// VISUALIZAÇÃO REMOTA
// ==================================================

function showRemoteVideo(stream) {

    remoteStream = stream;

    remoteVideo.srcObject = stream;
    remoteVideo.style.display = "block";

    viewerPlaceholder.style.display = "none";

    remoteVideo.play().catch(error => {
        console.warn(
            "O navegador pode exigir interação para reproduzir o áudio:",
            error
        );

        setStatus("Clique no vídeo para iniciar a reprodução.");
    });
}


function resetRemoteVideo() {

    remoteStream = null;

    remoteVideo.srcObject = null;
    remoteVideo.style.display = "none";

    viewerPlaceholder.style.display = "flex";

    setStatus("Aguardando conexão");
}


// ==================================================
// ENCERRAR SESSÃO
// ==================================================

async function stopCurrentSession() {

    const peer = activePeer;

    activePeer = null;

    if (peer) {
        peer.close();
    }

    if (localStream) {

        localStream.getTracks().forEach(track => {
            track.stop();
        });

        localStream = null;
    }

    if (remoteStream) {

        remoteStream.getTracks().forEach(track => {
            track.stop();
        });

        remoteStream = null;
    }

    videoSender = null;
    videoTrack = null;
    audioTrack = null;

    activeRole = null;
    isPaused = false;
    isAudioEnabled = true;

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    roomCode.value = "";

    setStudioVisible(false);
    homeSection.hidden = false;
    setViewerVisible(true);

    resetLocalPreview();
    resetRemoteVideo();

    shareButton.disabled = false;
    watchButton.disabled = false;

    pauseButton.disabled = false;
    audioButton.disabled = false;

    updatePauseInterface();
    updateAudioInterface();

    liveIndicator.style.display = "none";
}


// ==================================================
// CONFIGURAÇÃO DO TRANSMISSOR
// ==================================================

function setupHostPeer(peer) {

    peer.onconnectionstatechange = () => {

        if (activePeer !== peer) return;

        console.log("[TRANSMISSOR]", peer.connectionState);

        if (peer.connectionState === "connected") {
            setStatus("Transmissão conectada!");
        }

        if (peer.connectionState === "failed") {
            setStatus("Falha na conexão.");
        }

        if (peer.connectionState === "disconnected") {
            setStatus("Conexão interrompida.");
        }
    };
}


// ==================================================
// COMPARTILHAR TELA
// ==================================================

async function startSharing() {

    if (!navigator.mediaDevices?.getDisplayMedia) {

        alert(
            "Seu navegador não permite captura de tela neste endereço. " +
            "Utilize localhost ou uma página HTTPS."
        );

        return;
    }

    // Solicita a captura imediatamente no clique do usuário.
    // O navegador exibirá a janela de autorização.

    const capturePromise = navigator.mediaDevices.getDisplayMedia({

        video: getCaptureConstraints(),

        audio: shareAudio.checked

    });

    try {

        await stopCurrentSession();

        shareButton.disabled = true;

        setStatus("Solicitando permissão...");

        localStream = await capturePromise;

        activeRole = "host";

        videoTrack = localStream.getVideoTracks()[0];

        audioTrack = localStream.getAudioTracks()[0] || null;

        if (!videoTrack) {
            throw new Error("Nenhuma faixa de vídeo foi capturada.");
        }

        showLocalPreview(localStream);

        updateCaptureInformation();

        isPaused = false;

        isAudioEnabled = Boolean(audioTrack);

        updatePauseInterface();
        updateAudioInterface();

        setStudioVisible(true);
        homeSection.hidden = true;
        setViewerVisible(false);

        liveIndicator.style.display = "flex";

        setStatus("Criando transmissão...");

        // Se o usuário parar a captura pelo navegador.
        videoTrack.addEventListener("ended", () => {

            if (activeRole === "host") {
                stopCurrentSession();
            }

        });

        const roomId = await createRoom();

        roomCode.value = roomId;

        const peer = new RTCPeerConnection(ICE_SERVERS);

        activePeer = peer;

        setupHostPeer(peer);

        // Guarda o sender de vídeo para permitir pausar
        // sem interromper a prévia local.

        videoSender = peer.addTrack(videoTrack, localStream);

        if (audioTrack) {
            peer.addTrack(audioTrack, localStream);
        }

        // Cria oferta.

        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        setStatus("Preparando conexão...");

        await waitForIceGathering(peer);

        await postSignal(
            `/api/rooms/${roomId}/offer`,
            peer.localDescription.sdp
        );

        setStatus("Aguardando alguém entrar...");

        try {

            await navigator.clipboard.writeText(roomId);

        } catch (error) {

            console.warn("Não foi possível copiar automaticamente.", error);

        }

        // Aguarda a resposta do espectador.

        while (activePeer === peer) {

            const data = await getSignal(
                `/api/rooms/${roomId}/answer`
            );

            if (!data.waiting && data.sdp) {

                await peer.setRemoteDescription({

                    type: "answer",
                    sdp: data.sdp

                });

                setStatus("Resposta recebida. Conectando...");

                break;
            }

            await sleep(1500);
        }

    } catch (error) {

        console.error("[COMPARTILHAMENTO]", error);

        alert(
            "Não foi possível iniciar a transmissão:\n\n" +
            error.message
        );

        await stopCurrentSession();
    }
}


// ==================================================
// ASSISTIR TELA
// ==================================================

async function startWatching() {

    try {

        await stopCurrentSession();

        const roomId = inviteInput.value.trim().toUpperCase();

        if (!roomId) {
            throw new Error("Digite o código do convite.");
        }

        activeRole = "viewer";

        watchButton.disabled = true;

        homeSection.hidden = true;
        setViewerVisible(true);

        setStatus("Procurando transmissão...");

        const peer = new RTCPeerConnection(ICE_SERVERS);

        activePeer = peer;

        peer.ontrack = event => {

            if (activePeer !== peer) return;

            let stream = event.streams[0];

            if (!stream) {

                if (!remoteStream) {
                    remoteStream = new MediaStream();
                }

                remoteStream.addTrack(event.track);

                stream = remoteStream;
            }

            showRemoteVideo(stream);

            setStatus("Recebendo transmissão!");
        };

        peer.onconnectionstatechange = () => {

            if (activePeer !== peer) return;

            console.log("[ESPECTADOR]", peer.connectionState);

            if (peer.connectionState === "connected") {
                setStatus("Conectado!");
            }

            if (peer.connectionState === "failed") {
                setStatus("Falha na conexão.");
            }

            if (peer.connectionState === "disconnected") {
                setStatus("Conexão interrompida.");
            }
        };

        // Aguarda a oferta.

        let offerData;

        while (activePeer === peer) {

            offerData = await getSignal(
                `/api/rooms/${roomId}/offer`
            );

            if (!offerData.waiting && offerData.sdp) {
                break;
            }

            setStatus("Aguardando o transmissor...");

            await sleep(1500);
        }

        if (activePeer !== peer) return;

        await peer.setRemoteDescription({

            type: "offer",
            sdp: offerData.sdp

        });

        // Cria resposta.

        const answer = await peer.createAnswer();

        await peer.setLocalDescription(answer);

        setStatus("Preparando conexão...");

        await waitForIceGathering(peer);

        await postSignal(
            `/api/rooms/${roomId}/answer`,
            peer.localDescription.sdp
        );

        setStatus("Resposta enviada. Conectando...");

        document.getElementById("viewer").scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

    } catch (error) {

        console.error("[VISUALIZAÇÃO]", error);

        alert(
            "Não foi possível conectar:\n\n" +
            error.message
        );

        await stopCurrentSession();
    }
}


// ==================================================
// PAUSAR E RETOMAR VÍDEO
// ==================================================

pauseButton.addEventListener("click", async () => {

    if (!videoSender || !videoTrack) return;

    try {

        if (!isPaused) {

            await videoSender.replaceTrack(null);

            isPaused = true;

        } else {

            await videoSender.replaceTrack(videoTrack);

            isPaused = false;
        }

        updatePauseInterface();

    } catch (error) {

        console.error("[PAUSA]", error);

        alert("Não foi possível alterar o estado do vídeo.");
    }
});


// ==================================================
// CONTROLE DE ÁUDIO
// ==================================================

audioButton.addEventListener("click", () => {

    if (!audioTrack) return;

    isAudioEnabled = !isAudioEnabled;

    audioTrack.enabled = isAudioEnabled;

    updateAudioInterface();
});


// ==================================================
// ENCERRAR TRANSMISSÃO
// ==================================================

stopButton.addEventListener("click", async () => {

    const confirmed = confirm(
        "Deseja realmente encerrar a transmissão?"
    );

    if (!confirmed) return;

    await stopCurrentSession();
});


// ==================================================
// COPIAR CONVITE
// ==================================================

copyInviteButton.addEventListener("click", async () => {

    if (!roomCode.value) return;

    try {

        await navigator.clipboard.writeText(roomCode.value);

        const originalText = copyInviteButton.textContent;

        copyInviteButton.textContent = "Copiado!";

        setTimeout(() => {
            copyInviteButton.textContent = originalText;
        }, 1500);

    } catch (error) {

        roomCode.select();

        alert("Copie o código manualmente.");

    }
});


// ==================================================
// TELA CHEIA
// ==================================================

fullscreenButton.addEventListener("click", async () => {

    try {

        if (!document.fullscreenElement) {

            await remoteContainer.requestFullscreen();

        } else {

            await document.exitFullscreen();

        }

    } catch (error) {

        console.error("[TELA CHEIA]", error);

    }
});


// ==================================================
// EVENTOS DOS BOTÕES PRINCIPAIS
// ==================================================

shareButton.addEventListener("click", startSharing);

watchButton.addEventListener("click", startWatching);


// ==================================================
// INICIALIZAÇÃO
// ==================================================

liveIndicator.style.display = "none";

resetLocalPreview();
resetRemoteVideo();

updatePauseInterface();
updateAudioInterface();
