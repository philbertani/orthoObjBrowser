import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader";

class GPU {
  renderer;
  scene;
  camera;
  controls;
  mainLight;
  cameraLight;
  canvas = null;
  resized = false;
  controls = {};
  showShadows = 0;
  pointList = [];
  cameraType = 1; //orthographic
  objNum = 0;
  baryCenters = [];
  objects = [];
  labels = [];
  groupBaryCenter;
  pointer = { x: 0, y: 0 };
  measurePoints = [];
  currentMousePoint = null;
  numLines = 0;
  showText = false;
  zoom = 1;
  frustumFudge = 1.2;
  previousHighLighedIndex = -1;
  infoDiv;
  lineSegments=[];
  highlightLine=null;
  lineLabels = [];
  highlightObject=null;

  light2Pos = new THREE.Vector3();
  camX = new THREE.Vector3();
  camY = new THREE.Vector3();
  camZ = new THREE.Vector3();
  tempV = new THREE.Vector3();

  constructor(canvas) {
    this.canvas = canvas;
    window.addEventListener("resize", this.handleResize.bind(this), false);
    window.addEventListener("keypress", this.handleKeyPress.bind(this), false);
    this.infoDiv = document.getElementById("infoDiv");


    //THREE.Cache.enabled = false;
    THREE.Cache.clear();

    const canvasDim = canvas.getBoundingClientRect();
    const [width, height] = [canvasDim.width, canvasDim.height];
    this.width = width;
    this.height = height;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true});
    const renderer = this.renderer;

    this.raycaster = new THREE.Raycaster();

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height, true);
    renderer.setClearColor("rgb(150,150,250)", 1);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.needsUpdate = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    canvas.appendChild(renderer.domElement);
    this.canvas = canvas;
    this.scene = new THREE.Scene();

    const aspect = width / height;
    const frustumSize = 150 / this.frustumFudge;
    this.frustumSize = frustumSize;

    this.camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2 ,
      (frustumSize * aspect) / 2 ,
      frustumSize / 2,
      -frustumSize / 2,
      1,
      1000
    );

    this.camera.position.z = frustumSize ;

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 1000;
    this.controls.zoomSpeed = 1;

    //mainLight will look down z axis of camera
    this.mainLight = new THREE.PointLight(0xffffff, .9);
    //this.setShadow(this.mainLight);
    this.scene.add(this.mainLight);

    this.light2 = new THREE.PointLight(0xffffff,.6);
    this.scene.add(this.light2);

    const onProgress = function (xhr) {
      if (xhr.lengthComputable) {
        const percentComplete = (xhr.loaded / xhr.total) * 100;
        console.log(Math.round(percentComplete, 2) + "% downloaded");
      }
    };

    this.mtlL = new MTLLoader();
    this.objL = new OBJLoader();

    function computeBaryCenters(object) {
      object.frustumCulled = false;
      if (object.hasOwnProperty("material")) {
        object.material.side = THREE.DoubleSide;
        this.baryCenters.push(
          this.computeBaryCenter(object.geometry.attributes.position)
        );
      }
    }

    function centerGroup(object) {
      if (object.hasOwnProperty("material")) {
        object.position.add(this.groupBaryCenter);

        //create a label div which will get filled
        //during render loop
        const label = document.createElement("div");
        label.id = "label" + this.objNum;
        label.className = "objLabel";

        this.canvas.appendChild(label);
        label.style.display = "none";
        this.labels.push(label);

        object.name = "Object #" + this.objNum;
        this.objects.push(object);

        const objDiv = document.createElement("div");
        objDiv.innerHTML = object.name;
        objDiv.className = "objDiv";
        objDiv.id = "object"+this.objNum;
     
        this.infoDiv.appendChild(objDiv);

        this.objNum++;
      }
    }

    function loadObjects(object) {

      console.log(object);

      object.scale.set(1, 1, 1);
      this.scene.add(object);

      //very nice function with callback to get whole scene graph
      this.scene.traverse(computeBaryCenters.bind(this));

      //we now have the centers of all individual objects
      //now compute the center for the composite object
      this.groupBaryCenter = this.computeCompositeBaryCenter();
      console.log(this.groupBaryCenter);

      this.scene.traverse(centerGroup.bind(this));
      this.infoDiv.innerHTML += "<hr>";

      this.baryCenters.forEach((bary) => {
        bary.add(this.groupBaryCenter);
      });

      this.currentBigMouseSphere = new THREE.Mesh(this.bigSphere,this.selectPointMaterial);
      this.currentBigMouseSphere.visible = false;
      this.currentBiggerMouseSphere = new THREE.Mesh(this.sphere3,this.pointMaterial2);
      this.currentBiggerMouseSphere.visible = false;

      this.scene.add(this.currentBigMouseSphere);
      this.scene.add(this.currentBiggerMouseSphere);


      function checkObjId(str) {
        if (str[0]==="o") {  //id starts with (o)bject
          return str.slice(6); //return 6 through end which will be the object #
        }
        else {
          return null;
        }
      }
      function highlightObject(ev) {
        const objId = checkObjId(ev.target.id);
        if (objId) {

          if (this.highlightObject) {
            this.labels[this.highlightObject].style.display="none"; 
          }

          this.highlightObject = objId;
          this.labels[objId].style.display="block"
        }
        else if ( this.highlightObject) {
          this.labels[this.highlightObject].style.display="none";
        }
      }
      function unhighlightObject(ev) {
        const objId = checkObjId(ev.target.id);
        if (this.highlightObject) {
          this.labels[this.highlightObject].style.display="none";
          this.highlightObject = null;
        }
      }

      this.infoDiv.addEventListener("mouseover",highlightObject.bind(this));
      this.infoDiv.addEventListener("mouseleave",unhighlightObject.bind(this));
  

      this.renderer.render(this.scene, this.camera);
      this.render();
    }

    function loadMaterials(materials) {
      materials.preload();
      this.objL
        .setMaterials(materials)
        .setPath("./")
        .load("tinker.obj", loadObjects.bind(this), onProgress);
    }

    function checkMouse(ev) {
      //console.log(ev.clientX)
      const rect = this.canvas.getBoundingClientRect();
      //mouse coords are always in terms of whole screen so need to
      //subtract by top left corner of canvas
      this.pointer.x = ((ev.clientX - rect.left) / this.width) * 2 - 1;
      this.pointer.y = -((ev.clientY - rect.top) / this.height) * 2 + 1;
    }

    this.canvas.addEventListener("mousemove", checkMouse.bind(this), false);
    this.mouseObjectElem = document.getElementById("mouseObject");
    this.lineObjectElem = document.getElementById("lineObject");

    this.mtlL.setPath("./").load("obj.mtl", loadMaterials.bind(this));

    this.lineMaterial = new THREE.MeshPhongMaterial({
      color: "rgb(25,200,25)",
      shininess: 0
    });

    this.selectPointMaterial = new THREE.MeshPhongMaterial({
      color: "rgb(50,100,50)",
      opacity: 1,  //opacity does nothing with Subtractive
      transparent: true,
      blending: THREE.SubtractiveBlending,
      shininess: 0
    });

    this.pointMaterial2 = new THREE.MeshPhongMaterial({
      opacity: .5,
      transparent: true,
      blending: THREE.NormalBlending,
      shininess: 20
    });

    this.up = new THREE.Vector3(0,1,0);
    this.sphere2 = new THREE.SphereGeometry(.8);
    this.sphere3 = new THREE.SphereGeometry(2.);
    this.bigSphere = new THREE.SphereGeometry(1.);
 
  }

  computeBaryCenter(vertices) {
    //console.log('vvvvvvvvvv',vertices);
    //vertices is actually Float32BufferAttribute object
    const dim = vertices.itemSize;
    const n = vertices.count;
    const arr = vertices.array;
    const bary = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < dim; j++) {
        bary[j] += arr[i * dim + j];
      }
    }

    for (let j = 0; j < dim; j++) {
      bary[j] /= n;
    }
    return new THREE.Vector3(bary[0], bary[1], bary[2]);
  }

  computeCompositeBaryCenterOld() {
    const dim = this.baryCenters[0].length;
    const bary = [0, 0, 0];
    for (const center of this.baryCenters) {
      for (let j = 0; j < dim; j++) {
        bary[j] += center[j];
      }
    }

    console.log("composite baryCenter");
    for (let j = 0; j < dim; j++) {
      bary[j] /= this.baryCenters.length;
    }

    return new THREE.Vector3(-bary[0], -bary[1], -bary[2]);
  }

  computeCompositeBaryCenter() {
    const compBary = new THREE.Vector3();
    for (const center of this.baryCenters) {
      compBary.add(center);
    }
    compBary.multiplyScalar(-1 / this.baryCenters.length);
    return compBary;
  }

  cylinderMesh(pointX, pointY) {
    // edge from X to Y
    const edge = new THREE.Vector3().subVectors(pointY, pointX);
    // cylinder: radiusAtTop, radiusAtBottom,
    //     height, radiusSegments, heightSegments
    const edgeGeometry = new THREE.CylinderGeometry(
      .5,
      .5,
      edge.length(),
      4,
      1
    );
    
    const mesh = new THREE.Mesh(edgeGeometry,this.lineMaterial);
    const axis = this.up; //axis of cyl starts at UP
    mesh.quaternion.setFromUnitVectors(axis, edge.clone().normalize());

    const edgePos = new THREE.Vector3()
      .addVectors(pointX,edge.multiplyScalar(.5));

    mesh.position.copy(edgePos);
    mesh.edgeLength = edge.length();

    this.lineObjectElem.innerHTML = "<p>" +
      "<br>Line # and Length is: " + this.numLines + ", " + Math.trunc(mesh.edgeLength*1000)/1000;
      + "/p>"

    return mesh;
  }

  handleKeyPress(ev) {

    function rr(cc) {
      return Math.trunc(cc*10000)/10000;
    }

    //keys m and z are for add measuring points and for zooming in and out
    if (ev.keyCode === 109) {  //key m
      //console.log("measuring");
      if (this.currentMousePoint) {
        this.measurePoints.push(this.currentMousePoint);
        const newPoint = new THREE.Mesh(this.sphere2,this.lineMaterial);
        newPoint.position.copy(this.currentMousePoint);
        this.scene.add(newPoint);
        if (this.measurePoints.length > 1) {
          //add a cylinder from current to previous
          const prev = this.measurePoints.length - 2;
          const newEdge = this.cylinderMesh(
            this.measurePoints[prev],this.currentMousePoint);

          newEdge.name = "line " + this.numLines;
          newEdge.index = this.numLines;

          this.lineSegments.push(newEdge);
          this.numLines ++;

          //console.log(newEdge)
          this.scene.add(newEdge);

          const label = document.createElement("div");
          label.id = "line" + newEdge.index;
          label.className = "objLabel";  
          this.canvas.appendChild(label);
          label.style.display = "none";

          this.lineLabels.push(label);

          const lineDiv = document.createElement("div");
          lineDiv.innerHTML = newEdge.name + ", " + rr(newEdge.edgeLength);
          lineDiv.className = "objDiv";
          lineDiv.id = newEdge.index;

          function highlightLine(ev) {
            this.highlightLine = ev.target.id;
            this.lineLabels[ev.target.id].style.display="block";
  
          }
          function unhighlightLine(ev) {
            this.lineLabels[ev.target.id].style.display="none";
            this.highlightLine = null;
          }

          lineDiv.addEventListener("mouseover",highlightLine.bind(this));
          lineDiv.addEventListener("mouseleave",unhighlightLine.bind(this));

          this.infoDiv.appendChild(lineDiv);

        }
      }
    }
    else if (ev.keyCode === 122) {  //key z
      this.handleResizeOrtho("handleZoom")
      this.zoom ^= 1;
    }
  }

  handleResize() {
    if (this.cameraType === 1) {
      this.handleResizeOrtho();
      return;
    }

    const canvasDim = canvas.getBoundingClientRect();
    const [width, height] = [canvasDim.width, canvasDim.height];
    this.width = width;
    this.height = height;

    //console.log(this)  don't forget to bind the GPU this context to callback functions
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  handleResizeOrtho(handleZoom="") {
    const canvasDim = canvas.getBoundingClientRect();
    const [width, height] = [canvasDim.width, canvasDim.height];
    this.width = width;
    this.height = height;

    let zoomMult = 1;
    if (handleZoom) {
      zoomMult = (this.zoom === 0 ) ? 1 : 6;
    }

    if (handleZoom) {
      if ( zoomMult > 1 && this.currentMousePoint) {
        this.controls.target.copy(this.currentMousePoint);
      }
      else {
        this.controls.target.set(0,0,0);
      }
    }

    const aspect = width / height;
    this.camera.left = (-this.frustumSize * aspect) / 2 / zoomMult;
    this.camera.right = (this.frustumSize * aspect) / 2 / zoomMult;
    this.camera.top = this.frustumSize / 2 / zoomMult;
    this.camera.bottom = -this.frustumSize / 2 / zoomMult;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    this.controls.update();

  }

  setShadow(light) {
    light.castShadow = true;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 1024;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 1000;

    //have to set the range of the orthographic shadow camera
    //to cover the whole plane we are casting shadows onto
    //the shadows get fuzzier if these limits are much greater than the scene
    light.shadow.camera.left = -20;
    light.shadow.camera.bottom = -20;
    light.shadow.camera.right = 20;
    light.shadow.camera.top = 20;
  }

  setTextOrtho(textElem, vec3, text) {
   //we can make text follow objects by applying projection to center of object
  
    const tempV = this.tempV; //new THREE.Vector3();
    tempV.copy(vec3);

    tempV.project(this.camera); //gets us to the NDC coords/Clip Space for the center of this object

    const textX = (tempV.x * 0.5 + 0.5) * this.width; // NDC to pixel coords in div
    const textY = -(tempV.y * 0.5 + 0.5) * this.height; //CSS coords are opposite in Y direction

    //console.log(textX, textY)
    textElem.style.position = "absolute";
    textElem.textContent = text;
    textElem.style.color = "white";
    textElem.style.transform = `translate(-50%, -50%) translate(${textX}px,${textY}px)`;
    textElem.style.zIndex = ((-tempV.z * 0.5 + 0.5) * 100000) | 0;
  }

  render() {
    console.log("in render");
    let prevRenderTime = Date.now();
    const fps = 40;
    const fpsInterval = 1000 / fps;
    let frameCount = 0;
    requestAnimationFrame(renderLoop.bind(this));

    function renderLoop(time) {
      requestAnimationFrame(renderLoop.bind(this));

      //throttle the fps because without it just maxes
      //out the GPU for no good reason, for example it will
      //redisplay the same scene at 240 fps on this computer
      const currentRenderTime = Date.now();
      const elapsed = currentRenderTime - prevRenderTime;
      if (elapsed < fpsInterval) return;
      prevRenderTime = currentRenderTime - (elapsed % fpsInterval);
      time *= 0.001; //convert from milliseconds to seconds
      frameCount++;

      //set lights based on x,y,z axes of camera
      this.camera.matrixWorld.extractBasis(this.camX,this.camY,this.camZ);
      this.mainLight.position.copy(this.camZ.multiplyScalar(100));

      this.light2Pos.copy(this.camY);
      this.light2.position.copy(this.camY.multiplyScalar(1000));

      this.raycaster.setFromCamera(this.pointer, this.camera);
      if (frameCount % 40 === 0) {
        //console.log("origin:",this.raycaster.ray.origin)
        //console.log("dir:", this.raycaster.ray.direction)
      }

      const mousePicker = this.raycaster.intersectObjects(this.scene.children);

      this.currentBigMouseSphere.visible = false;  
      this.currentBiggerMouseSphere.visible = false;  

      this.currentMousePoint = null;

      if (mousePicker.length > 0 ) {
        //console.log(mousePicker[0])

        let pointToUse = mousePicker[0];
        for (const point of mousePicker) {

          if (point.object.edgeLength) {
            this.lineObjectElem.innerHTML = "";
            //console.log("length is:",point.object.edgeLength)
            this.lineObjectElem.innerHTML = "<p>" +
              "<br>Line # and Length is: " + point.object.index + ", " + Math.trunc(point.object.edgeLength*1000)/1000;
              + "/p>"
          }

          //only pick the coordinates of actual points in the original objects or else
          //we wind up making new vertices on the line segments
          if ( String(point.object.name).includes("Object")) {

            this.mouseObjectElem.innerHTML = "";
            pointToUse = point;

            this.currentBigMouseSphere.visible = true;
            this.currentBigMouseSphere.position.copy(point.point);

            this.currentBiggerMouseSphere.visible = true;
            this.currentBiggerMouseSphere.position.copy(point.point);

            const cc = pointToUse.object.material.color;
            let colorToUse = cc;

            function ET(cc) {  //(E)xponential (T)one map
              return 1 - Math.exp(-cc);
            }

            if ( !cc.hasOwnProperty("highlighted") ||
                (cc.hasOwnProperty("highlighted") && !cc.highlighted )) {

              //if something is already highlighted we need to know it's index
              if ( this.currentHighLighted ) {
                this.previousHighLighedIndex = this.currentHighLighted.index;
                this.currentHighLighted.material.color.copy(this.previousColor);
                this.currentHighLighted.material.color.highlighted = false;
              }

              const sc = 4;
              this.previousColor = new THREE.Color().copy(cc);
              const highlightColor = new THREE.Color(ET(cc.r*sc),ET(cc.g*sc),ET(cc.b*sc));
              cc.set(highlightColor);
              cc.highlighted = true;
              this.currentHighLighted = pointToUse.object;
              colorToUse = highlightColor;
            }

            //const newColor = new THREE.Color(1-cc.r,1-cc.g,1-cc.b);
            const newColor = new THREE.Color(1-colorToUse.r,1-colorToUse.g,1-colorToUse.b);
            this.currentBiggerMouseSphere.material.color.set(newColor);

            function rr(cc) {
              return Math.trunc(cc*1000)/1000;
            }
            this.mouseObjectElem.innerHTML +=
            "<p>" +
            pointToUse.object.name +
            "<br><br>Point<br>" +
            JSON.stringify(pointToUse.point) +
            "<br><br>Face<br>" +
            JSON.stringify(pointToUse.face) +
            "<br><br>Color<br>" +
            " red: "   + rr(this.previousColor.r) +
            " green: " + rr(this.previousColor.g) +
            " blue: "  + rr(this.previousColor.b)
            "</p>";
            break;
          }
        }        

        //check if new point is very close to one that exists
        //if it is use the exact position for that point
        this.currentMousePoint = pointToUse.point;
 
      }

      if ( !this.currentMousePoint ) {
        //if we get here we have to reset the color of the previous highlighted object
        if (this.currentHighLighted) {
          //console.log("we need to revert");
          //console.log(this.currentHighLighted.material.color);
          this.currentHighLighted.material.color.copy(this.previousColor);
          this.currentHighLighted.material.color.highlighted = false;
          this.currentHighLighted = null;
        }
      }

      if (this.highlightObject) {
        const i = this.highlightObject;
        //const obj = this.objects[i];
        const textElem = this.labels[i];
        const text = "obj#" + i;
        this.setTextOrtho(textElem, this.baryCenters[i], text);
      }

      if (this.highlightLine) {
        const textElem = this.lineLabels[this.highlightLine];
        const obj = this.lineSegments[this.highlightLine];
        const text = "line#" + this.highlightLine;
        this.setTextOrtho(textElem, obj.position, text);
      }

      this.renderer.render(this.scene, this.camera);
    }
  }
}

  export default GPU