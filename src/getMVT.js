import MVT from 'ol/format/MVT';
import {replayDeclutter} from "ol/render/canvas/ReplayGroup";
import {getSquaredTolerance, renderFeature} from "ol/renderer/vector";
import Projection from 'ol/proj/Projection.js';
import CanvasReplayGroup from "ol/render/canvas/ReplayGroup";



var Cesium = require('cesium/Cesium');
const mvtParser = new MVT();
var rbushProc = require('rbush');


const tileProjection = new Projection({
    code: '',
    units: 'tile-pixels',
    worldExtent: [-180, -90, -90, 0],
    extent: [0, 0, 4096, 4096]
});

let __styleProc = undefined;


// var declutterReplays = {};
// var vectorContents = [];
const rbush = rbushProc(9, undefined);


function setStyleProc(styleProc) {
    __styleProc = styleProc;
}


function onBeginFrame(frameState) {
    rbush.clear();
    // declutterReplays = {};

    frameState["declutterReplays"] = {};
    frameState["rbush"] = rbushProc(9, undefined);
    // vectorContents = [];
}

function onEndFrame(frameState) {
    // vectorContents.forEach(a => {
    //     replayDeclutter(declutterReplays, a, 0, true);
    // });
}

function requestTile(x, y, level, request, frameState, provider) {

    var doRequest = function (x, y, z) {
        var url = "http://localhost:8080/map/api/v1/tiles/11/{z}/{x}/{y}.pbf";
        url = url.replace('{x}', x).replace('{y}', y).replace('{z}', level).replace('{k}');

        var resource = Cesium.Resource.createIfNeeded(url);
        return resource.fetchArrayBuffer().then(function (arrayBuffer) {

            var canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            var vectorContext = canvas.getContext('2d');
            var features = mvtParser.readFeatures(arrayBuffer);

            const rbush = frameState["rbush"];
            var extent = [0, 0, 4096, 4096];
            //避让方法
            var replayGroup = new CanvasReplayGroup(0, extent, 8, window.devicePixelRatio, true, rbush, 100);
            // var replayGroup = new CanvasReplayGroup(0,extent,8,window.devicePixelRatio,true,null,100);
            var squaredTolerance = getSquaredTolerance(8, window.devicePixelRatio);


            try {
                if (!!features.length) {
                    for (var i = 0; i < features.length; i++) {
                        var feature = features[i];
                        if (feature.properties_.layer == 'ALRDL_C' && feature.properties_.ROUTENUM !== "") {
                        //     console.log(feature);
                             continue;
                        }

                        var styles = __styleProc(features[i], level);
                        if (!!styles) {
                            for (var j = 0; j < styles.length; j++) {
                                renderFeature(replayGroup, feature, styles[j], squaredTolerance);
                            }
                        }
                    }
                }
            } catch (e) {
                console.log(e);
            }
            replayGroup.finish();


            const declutterReplays = {}; // frameState["declutterReplays"];


            replayGroup.replay(vectorContext,
                provider._transform,
                0,
                {},
                true,
                provider._replays,
                declutterReplays);

            // var context = frameState.context;
            // var vc = context.getContext('2d');
            replayDeclutter(declutterReplays, vectorContext, 0, true);
            // vectorContents.push(vectorContext);


            provider.trimTile();

            canvas.xMvt = x;
            canvas.yMvt = y;
            canvas.zMvt = z;

            // delete replayGroup;
            replayGroup = null;
            provider.markTileRendered(canvas);

            return canvas;

        }).otherwise(function (error) {

        })
    };

    return doRequest(x, y, level);
}


export {requestTile, onBeginFrame, onEndFrame, setStyleProc};
