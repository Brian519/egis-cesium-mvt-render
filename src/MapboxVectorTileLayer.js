import MVT from 'ol/format/MVT';
import {replayDeclutter} from "ol/render/canvas/ReplayGroup";
import {getSquaredTolerance, renderFeature} from "ol/renderer/vector";
import CanvasReplayGroup from "ol/render/canvas/ReplayGroup";

const Cesium = require('cesium/Cesium');
const Rbush = require('rbush');
const mvtParser = new MVT();

class Declutter {

    constructor() {
        this.rbush = Rbush(9, undefined);
        this.declutterReplays = {};
        this.contexts = [];
    }

    addContext(declutterReplays, context) {
        this.contexts.push({
            declutterReplays: declutterReplays,
            context: context
        });

    }

    render() {
        var declutterReplays = this.declutterReplays;
        this.contexts.forEach((a) => {
            const declutterReplays = a.declutterReplays;
            const context = a.context;
            replayDeclutter(declutterReplays, context, 0, true);
        });
    }

    getRbush() {
        return this.rbush;
    }

    getDeclutterReplays() {
        return this.declutterReplays;
    }

}

class MapboxVectorTileLayer {

    constructor(name, url, funStyle) {
        this.provider = new Cesium.MapboxVectorTileProvider({
            url: url,
            projection: "4326",
            owner: this
        });
        this.url = url;
        this.name = name;
        this.funStyle = funStyle;
        this.canvases = {};
    }

    beginFrame(frameState) {
        frameState[this.name] = {
            tileCount: 0,
            declutter: new Declutter(),
            getDeclutter: function () {
                return this.declutter;
            },

            addRef() {
                this.tileCount++;
            },

            enouthTile(size) {
                return this.tileCount >= size;
            }
        }
    }

    endFrame(frameState) {

    }


    drawContext(canvas, features, x, y, level, provider) {
        const rbush = Rbush(9, undefined); // declutter.getRbush();
        const vectorContext = canvas.getContext('2d');
        const extent = [0, 0, 4096, 4096];
        let replayGroup = new CanvasReplayGroup(0, extent, 8, window.devicePixelRatio, true, rbush, 100);
        const squaredTolerance = getSquaredTolerance(8,
            window.devicePixelRatio);

        for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            const styles = this.funStyle(features[i], level);
            if (!!styles && !!styles.length) {
                for (let j = 0; j < styles.length; j++) {
                    renderFeature(replayGroup, feature, styles[j], squaredTolerance);
                }
            }
        }
        replayGroup.finish();

        const declutterReplays = {};
        replayGroup.replay(vectorContext, provider._transform, 0, {}, true, provider._replays, declutterReplays);
        replayDeclutter(declutterReplays, vectorContext, 0, true); // vectorContents.push(vectorContext);

        //  provider.trimTile();
        // provider.markTileRendered(canvas);

        canvas.xMvt = x;
        canvas.yMvt = y;
        canvas.zMvt = level;

        replayGroup = null;
    }

    takeCanvas(id) {
        if (!!this.canvases[id]) {
            return this.canvases[id];
        } else {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            this.canvases[id] = {
                canvas: canvas,
                already: false,
                count: 0
            };

            return this.canvases[id];
        }
    }

    removeCanvas(id) {
        if (!!this.canvases[id]) {
            delete this.canvases[id];
        }
    }

    fetchFeatures(url, done) {
        const resource = Cesium.Resource.createIfNeeded(url);
        resource.fetchArrayBuffer().then(function (arrayBuffer) {
            const features = mvtParser.readFeatures(arrayBuffer) || [];
            done(features);
            // that.drawContext(canvas, features, x, y, level, provider);
            // cc.already = true;
            //  return canvas;
        }).otherwise(function (error) {
            done([]);
        });

    }

    requestTile(x, y, level, request, frameState, provider) {
        const that = this;
        const doRequest = function (x, y, z) {
            const id = "{z}_{x}_{y}"
                .replace("{z}", z)
                .replace("{x}", x)
                .replace("{y}", y);

            const cc = that.takeCanvas(id);
            if (cc.already) {
                const p = new Promise(function (onFulfilled) {
                    try {
                        provider.trimTile();
                        provider.markTileRendered(cc.canvas);
                        that.removeCanvas(id);

                        return onFulfilled(cc.canvas);
                    } catch (e) {
                        return rejected(e);
                    }
                });
                return p;
            } else if (cc.count == 0) {
                const canvas = cc.canvas;
                cc.count++;

                const indexes = ["11", "13", "16", "15", "12", "14", "21", "22"];
                var features = [];
                var count = 0;
                var done = function (items) {
                    count++;
                    items.forEach(a => {
                        features.push(a);
                    });
                    if (count == indexes.length) {
                        if (features.length > 0) {
                            that.drawContext(canvas, features, x, y, level, provider);
                        }
                        cc.already = true;
                    }
                };

                const url = that.url;

                for (let i = 0; i < indexes.length; ++i) {
                    const index = indexes[i];
                    const pbfUrl = url.replace('{x}', x).replace('{y}', y).replace('{z}', level).replace('{index}', index);
                    that.fetchFeatures(pbfUrl, done);
                }

                // let url = that.url;
                // url = url.replace('{x}', x).replace('{y}', y).replace('{z}', level).replace('{k}');
                // // const canvas = document.createElement('canvas');
                // canvas.width = 512;
                // canvas.height = 512;

                // const resource = Cesium.Resource.createIfNeeded(url);
                // resource.fetchArrayBuffer().then(function (arrayBuffer) {
                //     const features = mvtParser.readFeatures(arrayBuffer) || [];
                //     that.drawContext(canvas, features, x, y, level, provider);
                //     cc.already = true;
                //     //  return canvas;
                // }).otherwise(function (error) {
                //
                // });
            }


            // return new Promise(resolve => {
            //     return canvas;
            // });

            //
            // var promise1 = new Promise(function(resolve, reject) {
            //     setTimeout(function() {
            //         resolve('foo');
            //     }, 300);
            // });
            //
            // promise1.then(function(value) {
            //     console.log(value);
            //     // expected output: "foo"
            // });
        };

        return doRequest(x, y, level);
    }

    getProvider() {
        return this.provider;
    }

}


export {MapboxVectorTileLayer};


// const rbush = Rbush(9, undefined); // declutter.getRbush();
//
// const extent = [0, 0, 4096, 4096];
// let replayGroup = new CanvasReplayGroup(0, extent, 8, window.devicePixelRatio, true, rbush, 100);
// const squaredTolerance = getSquaredTolerance(8,
//     window.devicePixelRatio);
//
// for (let i = 0; i < features.length; i++) {
//     const feature = features[i];
//     const styles = that.funStyle(features[i], level);
//     if (!!styles && !!styles.length) {
//         for (let j = 0; j < styles.length; j++) {
//             renderFeature(replayGroup, feature, styles[j], squaredTolerance);
//         }
//     }
// }
// replayGroup.finish();
//
// const declutterReplays = {}; //declutter.getDeclutterReplays(); // {};
// replayGroup.replay(vectorContext, provider._transform, 0, {}, true, provider._replays, declutterReplays);
// replayDeclutter(declutterReplays, vectorContext, 0, true); // vectorContents.push(vectorContext);
//
// provider.trimTile();
// provider.markTileRendered(canvas);
//
// canvas.xMvt = x;
// canvas.yMvt = y;
// canvas.zMvt = level;
//
// replayGroup = null;
