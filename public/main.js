var socket = io();

var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.msRTCSessionDescription;
navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.msGetUserMedia;

var configuration = {"iceServers": [{"urls": "stun:stun.l.google.com:19302"}]};

var pcPeers = {};
var selfView = document.getElementById("selfView");
var remoteViewContainer = document.getElementById("remoteViewContainer");
var localStream;

function handleSuccess(stream) {
  localStream = stream;
  selfView.autoplay = true;
  selfView.muted = true;
  selfView.playsInline = true;  
  selfView.srcObject = stream;

  if ('URLSearchParams' in window) {
    var searchParams = new URLSearchParams(window.location.search);
    if(searchParams.has("roomID")) {
      document.getElementById('roomID').value = searchParams.get("roomID");
      press();
    }
  }

}

function handleError(stream) {

}

function getLocalStream() {
  navigator.mediaDevices.getUserMedia({ "audio": true, "video": true }).then(handleSuccess).catch(handleError);
}

function join(roomID) {
  socket.emit('join', roomID, function(socketIds){
    console.log('join', socketIds);
    for (var i in socketIds) {
      var socketId = socketIds[i];
      createPC(socketId, true);
    }
  });
}

function createPC(socketId, isOffer) {
  var pc = new RTCPeerConnection(configuration);
  pcPeers[socketId] = pc;

  pc.onicecandidate = function (event) {
    console.log('onicecandidate', event);
    if (event.candidate) {
      socket.emit('exchange', {'to': socketId, 'candidate': event.candidate });
    }
  };

  function createOffer() {
    pc.createOffer().then(function(desc) {
      console.log('createOffer', desc);
      return pc.setLocalDescription(desc).then(function () {
        console.log('setLocalDescription', pc.localDescription);
        socket.emit('exchange', {'to': socketId, 'sdp': pc.localDescription });
      }, logError);
    }, logError);
  }

  if (isOffer) {
    pc.onnegotiationneeded = function () {
      console.log('onnegotiationneeded');   
      createOffer();
    }
    dataChannel = pc.createDataChannel('chat');
    createDataChannel();
  }
  else {
    pc.ondatachannel = event => {
      dataChannel = event.channel;
      createDataChannel();
    }
  }

  pc.oniceconnectionstatechange = function(event) {
    console.log('oniceconnectionstatechange', event);
    if (event.target.iceConnectionState === 'connected') {
    }
  };
  pc.onsignalingstatechange = function(event) {
    console.log('onsignalingstatechange', event);
  };

  var element = document.createElement('video');
  pc.ontrack = function (event) {
    console.log('onaddstream', event);
    element.id = "remoteView" + socketId;
    element.autoplay = true;
    element.playsInline = true;
    element.srcObject = event.streams[0];
  };
  remoteViewContainer.appendChild(element);
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  function createDataChannel() {
    dataChannel.onerror = function (error) {
      console.log("dataChannel.onerror", error);
    };

    dataChannel.onmessage = function (event) {
      console.log("dataChannel.onmessage:", event.data);
      var content = document.getElementById('textRoomContent');
      content.innerHTML = content.innerHTML + '<p>' + socketId + ': ' + event.data + '</p>';
    };

    dataChannel.onopen = function () {
      console.log('dataChannel.onopen');
      var textRoom = document.getElementById('textRoom');
      textRoom.style.display = "block";
    };

    dataChannel.onclose = function () {
      console.log("dataChannel.onclose");
    };

    pc.textDataChannel = dataChannel;
  }
  return pc;
}


async function exchange(data) {
  try {
    var fromId = data.from;
    var pc;
    if (fromId in pcPeers) {
      pc = pcPeers[fromId];
    } else {
      pc = createPC(fromId, false);
    }

    async function createMyStream() {
     if (pc.remoteDescription.type == "offer") {
       pc.createAnswer().then(async function(desc) {
         console.log('createAnswer', desc);
         await pc.setLocalDescription(desc);
       })
       .then(function () {
        console.log('setLocalDescription', pc.localDescription);
        socket.emit('exchange', {'to': fromId, 'sdp': pc.localDescription });
      })
       .catch()
     }
   }

   if (data.sdp) {
    console.log('exchange sdp', data);
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
    .then(function () {
      return createMyStream();
    })
  }
  else {
    console.log('exchange candidate', data);
    await pc.addIceCandidate(data.candidate);
  }
}
catch(err) {
  console.error(err);
}
}

function leave(socketId) {
  console.log('leave', socketId);
  var pc = pcPeers[socketId];
  pc.close();
  delete pcPeers[socketId];
  var video = document.getElementById("remoteView" + socketId);
  if (video) video.remove();
}

socket.on('exchange', function(data){
  exchange(data);
});
socket.on('leave', function(socketId){
  leave(socketId);
});

socket.on('connect', function(data) {
  console.log('connect');
  getLocalStream();
});

function logError(error) {
  console.log("logError", error);
}

function press() {
  var roomID = document.getElementById('roomID').value;
  if (roomID == "") {
    alert('Please enter room ID');
  } else {
    if ('URLSearchParams' in window) {
      var searchParams = new URLSearchParams(window.location.search);
      if(!searchParams.has("roomID")) {
        searchParams.set("roomID", roomID);
        window.location.search = searchParams.toString();
      }
    }

    var roomIDContainer = document.getElementById('roomIDContainer');
    roomIDContainer.parentElement.removeChild(roomIDContainer);
    join(roomID);
  }
}
function textRoomPress() {
  var text = document.getElementById('textRoomInput').value;
  if (text == "") {
    alert('Enter something');
  } else {
    document.getElementById('textRoomInput').value = '';
    var content = document.getElementById('textRoomContent');
    content.innerHTML = content.innerHTML + '<p>' + 'Me' + ': ' + text + '</p>';
    for (var key in pcPeers) {
      var pc = pcPeers[key];
      pc.textDataChannel.send(text);
    }
  }
}