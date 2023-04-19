import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader";

class GPU {

    renderer;  scene; camera; controls;
    mainLight; cameraLight;
    canvas = null;
    resized = false;
    controls = {};
    showShadows = 0;
    pointList = [];
    cameraType = 1;  //orthographic
    objNum = 0;
    baryCenters = [];
    objects = []
    labels = []
    groupBaryCenter;
    pointer = {x:0, y:0};

    constructor(canvas) {

      this.canvas = canvas
      window.addEventListener("resize",this.handleResize.bind(this),false )

      const canvasDim = canvas.getBoundingClientRect();
      const [width, height] = [canvasDim.width, canvasDim.height];
      this.width = width; this.height = height;

      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      const renderer = this.renderer;

      this.raycaster = new THREE.Raycaster();

      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(width, height, true);
      renderer.setClearColor("rgb(255,255,255)", 1);

      renderer.shadowMap.enabled = true;
      renderer.shadowMap.needsUpdate = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;

      canvas.appendChild(renderer.domElement);
      this.canvas = canvas;
      this.scene = new THREE.Scene();

      const aspect = width/height
      const frustumSize = 150

      this.frustumSize = frustumSize;
      //this.camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 3000);

      this.camera = new THREE.OrthographicCamera( 
        -frustumSize * aspect / 2, 
        frustumSize * aspect / 2, 
        frustumSize / 2, 
        -frustumSize / 2, 
        1, 1000);

      this.camera.position.z = frustumSize / 2;
  
      this.controls = new OrbitControls(this.camera, renderer.domElement);
      this.controls.minDistance = .1;
      this.controls.maxDistance = 1000;
      this.controls.zoomSpeed = 1;

      this.mainLight = new THREE.DirectionalLight(0xFFFFFF, .8)
      this.mainLight.position.set(0,0,5000)
      this.setShadow(this.mainLight)
      this.scene.add(this.mainLight)

      this.cameraLight = new THREE.PointLight(0xFFFF00,.6)
      this.setShadow(this.cameraLight)
      this.camera.add(this.cameraLight)
      this.scene.add(this.camera)

      const onProgress = function ( xhr ) {

        if ( xhr.lengthComputable ) {
          const percentComplete = xhr.loaded / xhr.total * 100;
          console.log( Math.round( percentComplete, 2 ) + '% downloaded' );
        }
      };

      this.mtlL = new MTLLoader();
      this.objL = new OBJLoader();
      
      function computeBaryCenters(object) {
        object.frustumCulled = false;
        if ( object.hasOwnProperty("material")) {
          object.material.side = THREE.DoubleSide;
          this.baryCenters.push(
            this.computeBaryCenter(object.geometry.attributes.position)
          );
 
        }
      }

      function centerGroup(object) {
        if ( object.hasOwnProperty("material")) {
          object.position.add(this.groupBaryCenter)

          //create a label div which will get filled
          //during render loop
          const label = document.createElement('div')
          label.id = "label" + this.objNum;
          label.className = "objLabel"
      
          this.canvas.appendChild(label);
          this.labels.push(label)

          object.name = "Object #" + this.objNum;
          this.objects.push(object)

          this.objNum ++;
        }
      }

      function loadObjects(object) {
  
        console.log(object)
        
        object.scale.set(1,1,1);
        this.scene.add(object);
           
        //very nice function with callback to get whole scene graph
        this.scene.traverse( computeBaryCenters.bind(this)) 

        //we now have the centers of all individual objects
        //now compute the center for the composite object
        this.groupBaryCenter = this.computeCompositeBaryCenter()
        console.log(this.groupBaryCenter)

        this.scene.traverse( centerGroup.bind(this))

        console.log(this.labels);
        console.log(this.objects)

        //
        this.baryCenters.forEach(bary=>{bary.add(this.groupBaryCenter)})

        this.renderer.render(this.scene, this.camera);
        this.render();
      }

      function loadMaterials(materials) {
        materials.preload();
        this.objL
          .setMaterials(materials)
          .setPath('./')
          .load('tinker.obj', loadObjects.bind(this), onProgress )
      }

      function checkMouse(ev) {
        //console.log(ev.clientX)
        const rect = this.canvas.getBoundingClientRect();
        //mouse coords are always in terms of whole screen so need to
        //subtract by top left corner of canvas
        this.pointer.x = ( (ev.clientX-rect.left) / this.width)*2 - 1;
        this.pointer.y = -( (ev.clientY-rect.top) / this.height)*2 + 1; 
      }

      this.canvas.addEventListener('mousemove',checkMouse.bind(this),false)
      this.mouseObjectElem = document.getElementById('mouseObject')

      this.mtlL
        .setPath('./')
        .load('obj.mtl', loadMaterials.bind(this))

    }
  
    computeBaryCenter(vertices) {
      //console.log('vvvvvvvvvv',vertices); 
      //vertices is actually Float32BufferAttribute object
      const dim = vertices.itemSize; 
      const n = vertices.count;
      const arr = vertices.array;
      const bary = [0,0,0] ;
      for (let i=0; i<n; i++) {
        for (let j=0; j<dim; j++) {
          bary[j] += arr[i*dim + j];
        }
      }
    
      for (let j=0; j<dim; j++) {
        bary[j] /= n;
      }
      return new THREE.Vector3(bary[0],bary[1],bary[2]);
    }

    computeCompositeBaryCenterOld() {

      const dim = this.baryCenters[0].length
      const bary = [0,0,0]
      for (const center of this.baryCenters) {
        for (let j=0; j<dim; j++) {
          bary[j] += center[j]
        }
      }

      console.log('composite baryCenter')
      for (let j=0; j<dim; j++) {
        bary[j] /= this.baryCenters.length
      }

      return new THREE.Vector3(-bary[0],-bary[1],-bary[2])

    }

    computeCompositeBaryCenter() {
      const compBary = new THREE.Vector3()
      for (const center of this.baryCenters) {
        compBary.add(center)
      }
      compBary.multiplyScalar(-1/this.baryCenters.length) 
      return compBary;
    }

    handleResize() {
  
      if (this.cameraType===1) {
        this.handleResizeOrtho();
        return;
      }

      const canvasDim = canvas.getBoundingClientRect();
      const [width, height] = [canvasDim.width, canvasDim.height];
      this.width = width; this.height = height;

      //console.log(this)  don't forget to bind the GPU this context to callback functions
      this.camera.aspect = width / height
      this.camera.updateProjectionMatrix()
      this.renderer.setSize( width, height)
    }

    handleResizeOrtho() {

      const canvasDim = canvas.getBoundingClientRect();
      const [width, height] = [canvasDim.width, canvasDim.height];
      this.width = width; this.height = height;

      const aspect = width / height;
      this.camera.left = -this.frustumSize * aspect / 2;
      this.camera.right = this.frustumSize * aspect / 2;
      this.camera.top  = this.frustumSize  / 2;
      this.camera.bottom = -this.frustumSize / 2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize( width, height);

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
 
    setText(textElem, object, text) {
      //we can make text follow ojbects by reversing some matrix transformations
      const tempV = new THREE.Vector3()
      object.updateWorldMatrix(true,false) 
      object.getWorldPosition(tempV)  //get the World Position Vector
  
      tempV.project(this.camera) //gets us to the NDC coords for the center of this object

      const textX = (tempV.x*.5+.5)*this.width;  // NDC to pixel coords in div
      const textY = (tempV.y*-.5+.5)*this.height;  //CSS coords are opposite in Y direction

      textElem.style.position = "absolute"
      textElem.textContent = text
      textElem.style.color = "black"
      
      textElem.style.transform = `translate(-50%, -50%) translate(${textX}px,${textY}px)`;
    }

    setTextOrtho(textElem, vec3, text) {
      //we can make text follow ojbects by reversing some matrix transformations
      const tempV = new THREE.Vector3();
      tempV.copy(vec3);
    
      tempV.project(this.camera)      //gets us to the NDC coords/Clip Space for the center of this object
  
      const textX = (tempV.x*.5+.5)*this.width;  // NDC to pixel coords in div
      const textY = -(tempV.y*.5+.5)*this.height;  //CSS coords are opposite in Y direction

      //console.log(textX, textY)
      textElem.style.position = "absolute"
      textElem.textContent = text
      textElem.style.color = "white"
      textElem.style.transform = `translate(-50%, -50%) translate(${textX}px,${textY}px)`;
      textElem.style.zIndex = 
        ((-tempV.z * 0.5 + 0.5) * 100000) | 0;
    }

    render() {
   
      console.log('in render')
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
        frameCount ++;

        this.raycaster.setFromCamera(this.pointer,this.camera);
        if (frameCount%40===0) {
          console.log("origin:",this.raycaster.ray.origin)
          console.log("dir:", this.raycaster.ray.direction)
        }

        const mousePicker = this.raycaster.intersectObjects(this.scene.children) 

        //console.log(mousePicker.length)

        if (mousePicker.length > 0) {
          //console.log(mousePicker[0])
          this.mouseObjectElem.innerHTML = 
            "<p>" + mousePicker[0].object.name + "<br><br>Point<br>" + 
            JSON.stringify(mousePicker[0].point) + "<br><br>Face<br>" +
            JSON.stringify(mousePicker[0].face) +
            "</p>"
        }
        else {
          this.mouseObjectElem.innerHTML = ""
        }

        for (let i=0; i<this.objects.length; i++) {
          const obj = this.objects[i];
          const textElem = this.labels[i];
          const text = "obj#" + i;

          this.setTextOrtho(textElem,this.baryCenters[i],text)
        }

        this.renderer.render(this.scene, this.camera);
      }
    }
  }

  export default GPU