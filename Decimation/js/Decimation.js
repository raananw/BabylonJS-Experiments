﻿/* MIT License
Copyright (c) 2014-2015 Raanan Weber (raananw@gmail.com)
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in the
Software without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:
The above copyright notice and this permission notice shall be included in all copies
or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
var RaananW;
(function (RaananW) {
    /*
    * Quadratic Error surfac simplification based on  http://www.cs.cmu.edu/afs/cs.cmu.edu/user/garland/www/Papers/quadric2.pdf
    * Code mostly ported from http://voxels.blogspot.de/2014/05/quadric-mesh-simplification-with-source.html to JavaScript / BabylonJS
    * Raanan Weber, 2014-2015
    */
    (function (Decimation) {
        var DecimationTriangle = (function () {
            function DecimationTriangle(vertices) {
                this.vertices = vertices;
                this.error = new Array(4);
                this.deleted = false;
                this.isDirty = false;
                this.borderFactor = 0;
            }
            return DecimationTriangle;
        })();
        Decimation.DecimationTriangle = DecimationTriangle;

        var DecimationVertex = (function () {
            function DecimationVertex(position, normal, uv, id) {
                this.position = position;
                this.normal = normal;
                this.uv = uv;
                this.id = id;
                this.isBorder = true;
                this.q = new DecimationMatrix();
                this.triangleCount = 0;
                this.triangleStart = 0;
            }
            return DecimationVertex;
        })();
        Decimation.DecimationVertex = DecimationVertex;

        var DecimationMatrix = (function () {
            function DecimationMatrix(data) {
                this.data = new Array(10);
                for (var i = 0; i < 10; ++i) {
                    if (data && data[i]) {
                        this.data[i] = data[i];
                    } else {
                        this.data[i] = 0;
                    }
                }
            }
            DecimationMatrix.prototype.det = function (a11, a12, a13, a21, a22, a23, a31, a32, a33) {
                var det = this.data[a11] * this.data[a22] * this.data[a33] + this.data[a13] * this.data[a21] * this.data[a32] + this.data[a12] * this.data[a23] * this.data[a31] - this.data[a13] * this.data[a22] * this.data[a31] - this.data[a11] * this.data[a23] * this.data[a32] - this.data[a12] * this.data[a21] * this.data[a33];
                return det;
            };

            DecimationMatrix.prototype.addInPlace = function (matrix) {
                for (var i = 0; i < 10; ++i) {
                    this.data[i] += matrix.data[i];
                }
            };

            DecimationMatrix.prototype.addArrayInPlace = function (data) {
                for (var i = 0; i < 10; ++i) {
                    this.data[i] += data[i];
                }
            };

            DecimationMatrix.prototype.add = function (matrix) {
                var m = new DecimationMatrix();
                for (var i = 0; i < 10; ++i) {
                    m.data[i] = this.data[i] + matrix.data[i];
                }
                return m;
            };

            DecimationMatrix.FromData = function (a, b, c, d) {
                var data = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d];
                return new DecimationMatrix(data);
            };

            //trying to avoid garbage collection
            DecimationMatrix.DataFromNumbers = function (a, b, c, d) {
                return [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d];
            };
            return DecimationMatrix;
        })();
        Decimation.DecimationMatrix = DecimationMatrix;

        var Reference = (function () {
            function Reference(vertexId, triangleId) {
                this.vertexId = vertexId;
                this.triangleId = triangleId;
            }
            return Reference;
        })();
        Decimation.Reference = Reference;

        var Decimator = (function () {
            function Decimator(_mesh) {
                this._mesh = _mesh;
                this.initialised = false;
                this._syncIterations = 5000;
            }
            Decimator.prototype.reInit = function (callback) {
                this.initWithMesh(this._mesh, callback);
            };

            Decimator.prototype.initWithMesh = function (mesh, callback) {
                var _this = this;
                if (!mesh)
                    return;

                this.vertices = [];
                this.triangles = [];

                this._mesh = mesh;
                var positionData = this._mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
                var normalData = this._mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
                var uvs = this._mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
                var indices = mesh.getIndices();

                var vertexInit = function (i) {
                    var vertex = new DecimationVertex(BABYLON.Vector3.FromArray(positionData, i * 3), BABYLON.Vector3.FromArray(normalData, i * 3), BABYLON.Vector2.FromArray(uvs, i * 2), i);
                    _this.vertices.push(vertex);
                };

                var totalVertices = mesh.getTotalVertices();
                RaananW.Tools.SyncToAsyncForLoop(totalVertices, this._syncIterations, vertexInit, function () {
                    var indicesInit = function (i) {
                        var pos = i * 3;
                        var i0 = indices[pos + 0];
                        var i1 = indices[pos + 1];
                        var i2 = indices[pos + 2];
                        var triangle = new DecimationTriangle([_this.vertices[i0].id, _this.vertices[i1].id, _this.vertices[i2].id]);
                        _this.triangles.push(triangle);
                    };

                    RaananW.Tools.SyncToAsyncForLoop(indices.length / 3, _this._syncIterations, indicesInit, function () {
                        _this.init(callback);
                    });
                });
            };

            Decimator.prototype.reconstructMesh = function () {
                var newTriangles = [];

                for (var i = 0; i < this.vertices.length; ++i) {
                    this.vertices[i].triangleCount = 0;
                }
                for (var i = 0; i < this.triangles.length; ++i) {
                    if (!this.triangles[i].deleted) {
                        var t = this.triangles[i];
                        for (var j = 0; j < 3; ++j) {
                            this.vertices[t.vertices[j]].triangleCount = 1;
                        }
                        newTriangles.push(t);
                    }
                }

                var newVerticesOrder = [];

                //compact vertices, get the IDs of the vertices used.
                var dst = 0;
                for (var i = 0; i < this.vertices.length; ++i) {
                    if (this.vertices[i].triangleCount) {
                        this.vertices[i].triangleStart = dst;
                        this.vertices[dst].position = this.vertices[i].position;
                        this.vertices[dst].normal = this.vertices[i].normal;
                        this.vertices[dst].uv = this.vertices[i].uv;
                        newVerticesOrder.push(i);
                        dst++;
                    }
                }

                for (var i = 0; i < newTriangles.length; ++i) {
                    var t = newTriangles[i];
                    for (var j = 0; j < 3; ++j) {
                        t.vertices[j] = this.vertices[t.vertices[j]].triangleStart;
                    }
                }
                this.vertices = this.vertices.slice(0, dst);

                var newPositionData = [];
                var newNormalData = [];
                var newUVsData = [];

                for (var i = 0; i < newVerticesOrder.length; ++i) {
                    newPositionData.push(this.vertices[i].position.x);
                    newPositionData.push(this.vertices[i].position.y);
                    newPositionData.push(this.vertices[i].position.z);
                    newNormalData.push(this.vertices[i].normal.x);
                    newNormalData.push(this.vertices[i].normal.y);
                    newNormalData.push(this.vertices[i].normal.z);
                    newUVsData.push(this.vertices[i].uv.x);
                    newUVsData.push(this.vertices[i].uv.y);
                }

                var newIndicesArray = [];
                for (var i = 0; i < newTriangles.length; ++i) {
                    newIndicesArray.push(newTriangles[i].vertices[0]);
                    newIndicesArray.push(newTriangles[i].vertices[1]);
                    newIndicesArray.push(newTriangles[i].vertices[2]);
                }

                var newMesh = new BABYLON.Mesh(this._mesh + "Decimated", this._mesh.getScene());
                newMesh.material = this._mesh.material;
                newMesh.parent = this._mesh.parent;

                //var geometry = new BABYLON.Geometry("g1", this._mesh.getScene()); //clone in order to get the skeleton working.
                newMesh.setIndices(newIndicesArray);
                newMesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, newPositionData);
                newMesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, newNormalData);
                newMesh.setVerticesData(BABYLON.VertexBuffer.UVKind, newUVsData);

                //geometry.applyToMesh(newMesh);
                //preparing the skeleton support
                if (this._mesh.skeleton) {
                    //newMesh.skeleton = this._mesh.skeleton.clone("", "");
                    //newMesh.getScene().beginAnimation(newMesh.skeleton, 0, 100, true, 1.0);
                }

                return newMesh;
            };

            Decimator.prototype.runDecimation = function (quality, successCallback, agressiveness, iterations) {
                var _this = this;
                if (typeof agressiveness === "undefined") { agressiveness = 7; }
                if (typeof iterations === "undefined") { iterations = 100; }
                if (!this.initialised) {
                    throw new Error("decimation not initialised. please call reInit!");
                }

                var targetCount = ~~(this.triangles.length * quality);
                var deletedTriangles = 0;

                var triangleCount = this.triangles.length;

                var iterationFunction = function (iteration, callback) {
                    setTimeout(function () {
                        if (iteration % 5 == 0) {
                            _this.updateMesh(iteration == 0);
                        }

                        for (var i = 0; i < _this.triangles.length; ++i) {
                            _this.triangles[i].isDirty = false;
                        }

                        var threshold = 0.000000001 * Math.pow((iteration + 3), agressiveness);

                        var trianglesIterator = function (i) {
                            var tIdx = ((_this.triangles.length / 2) + i) % _this.triangles.length;
                            var t = _this.triangles[i];
                            if (!t)
                                return;
                            if (t.error[3] > threshold) {
                                return;
                            }
                            if (t.deleted) {
                                return;
                            }
                            if (t.isDirty) {
                                return;
                            }

                            for (var j = 0; j < 3; ++j) {
                                if (t.error[j] < threshold) {
                                    var deleted0 = [];
                                    var deleted1 = [];

                                    var i0 = t.vertices[j];
                                    var i1 = t.vertices[(j + 1) % 3];
                                    var v0 = _this.vertices[i0];
                                    var v1 = _this.vertices[i1];

                                    if (v0.isBorder != v1.isBorder)
                                        continue;

                                    var p = BABYLON.Vector3.Zero();
                                    var n = BABYLON.Vector3.Zero();
                                    var uv = BABYLON.Vector2.Zero();

                                    _this.calculateError(v0, v1, p, n, uv);

                                    if (_this.isFlipped(v0, i1, p, deleted0, t.borderFactor))
                                        continue;
                                    if (_this.isFlipped(v1, i0, p, deleted1, t.borderFactor))
                                        continue;

                                    v0.position = p;
                                    v0.normal = n;
                                    v0.uv = uv;
                                    v0.q = v1.q.add(v0.q);
                                    var tStart = _this.references.length;

                                    deletedTriangles = _this.updateTriangles(v0.id, v0, deleted0, deletedTriangles);
                                    deletedTriangles = _this.updateTriangles(v0.id, v1, deleted1, deletedTriangles);

                                    var tCount = _this.references.length - tStart;

                                    if (tCount <= v0.triangleCount) {
                                        if (tCount) {
                                            for (var c = 0; c < tCount; c++) {
                                                _this.references[v0.triangleStart + c] = _this.references[tStart + c];
                                            }
                                        }
                                    } else {
                                        v0.triangleStart = tStart;
                                    }

                                    v0.triangleCount = tCount;
                                    break;
                                }
                            }
                        };
                        RaananW.Tools.SyncToAsyncForLoop(_this.triangles.length, _this._syncIterations, trianglesIterator, callback, function () {
                            return (triangleCount - deletedTriangles <= targetCount);
                        });
                    }, 0);
                };

                RaananW.Tools.AsyncLoop(100, function (loop) {
                    if (triangleCount - deletedTriangles <= targetCount)
                        loop.stop();
                    else {
                        iterationFunction(loop.currentIndex(), function () {
                            loop.executeNext();
                        });
                    }
                }, function () {
                    setTimeout(function () {
                        successCallback(_this.reconstructMesh());
                    }, 0);
                });
            };

            Decimator.prototype.isFlipped = function (vertex1, index2, point, deletedArray, borderFactor) {
                for (var i = 0; i < vertex1.triangleCount; ++i) {
                    var t = this.triangles[this.references[vertex1.triangleStart + i].triangleId];
                    if (t.deleted)
                        continue;

                    var s = this.references[vertex1.triangleStart + i].vertexId;

                    var id1 = t.vertices[(s + 1) % 3];
                    var id2 = t.vertices[(s + 2) % 3];

                    if ((id1 == index2 || id2 == index2) && borderFactor < 2) {
                        deletedArray[i] = true;
                        continue;
                    }

                    var d1 = this.vertices[id1].position.subtract(point);
                    d1 = d1.normalize();
                    var d2 = this.vertices[id2].position.subtract(point);
                    d2 = d2.normalize();
                    if (Math.abs(BABYLON.Vector3.Dot(d1, d2)) > 0.999)
                        return true;
                    var normal = BABYLON.Vector3.Cross(d1, d2).normalize();
                    deletedArray[i] = false;
                    if (BABYLON.Vector3.Dot(normal, t.normal) < 0.2)
                        return true;
                }

                return false;
            };

            Decimator.prototype.updateTriangles = function (vertexId, vertex, deletedArray, deletedTriangles) {
                var newDeleted = deletedTriangles;
                for (var i = 0; i < vertex.triangleCount; ++i) {
                    var ref = this.references[vertex.triangleStart + i];
                    var t = this.triangles[ref.triangleId];
                    if (t.deleted)
                        continue;
                    if (deletedArray[i]) {
                        t.deleted = true;
                        newDeleted++;
                        continue;
                    }
                    t.vertices[ref.vertexId] = vertexId;
                    t.isDirty = true;
                    t.error[0] = this.calculateError(this.vertices[t.vertices[0]], this.vertices[t.vertices[1]]) + (t.borderFactor / 2);
                    t.error[1] = this.calculateError(this.vertices[t.vertices[1]], this.vertices[t.vertices[2]]) + (t.borderFactor / 2);
                    t.error[2] = this.calculateError(this.vertices[t.vertices[2]], this.vertices[t.vertices[0]]) + (t.borderFactor / 2);
                    t.error[3] = Math.min(t.error[0], t.error[1], t.error[2]);
                    this.references.push(ref);
                }
                return newDeleted;
            };

            Decimator.prototype.init = function (callback) {
                var _this = this;
                var triangleInit1 = function (i) {
                    var t = _this.triangles[i];
                    t.normal = BABYLON.Vector3.Cross(_this.vertices[t.vertices[1]].position.subtract(_this.vertices[t.vertices[0]].position), _this.vertices[t.vertices[2]].position.subtract(_this.vertices[t.vertices[0]].position)).normalize();
                    for (var j = 0; j < 3; j++) {
                        _this.vertices[t.vertices[j]].q.addArrayInPlace(DecimationMatrix.DataFromNumbers(t.normal.x, t.normal.y, t.normal.z, -(BABYLON.Vector3.Dot(t.normal, _this.vertices[t.vertices[0]].position))));
                    }
                };

                RaananW.Tools.SyncToAsyncForLoop(this.triangles.length, this._syncIterations, triangleInit1, function () {
                    var triangleInit2 = function (i) {
                        var t = _this.triangles[i];
                        for (var j = 0; j < 3; ++j) {
                            t.error[j] = _this.calculateError(_this.vertices[t.vertices[j]], _this.vertices[t.vertices[(j + 1) % 3]]);
                        }
                        t.error[3] = Math.min(t.error[0], t.error[1], t.error[2]);
                    };

                    RaananW.Tools.SyncToAsyncForLoop(_this.triangles.length, _this._syncIterations, triangleInit2, function () {
                        _this.initialised = true;
                        callback();
                    });
                });
            };

            Decimator.prototype.identifyBorder = function () {
                for (var i = 0; i < this.vertices.length; ++i) {
                    var vCount = [];
                    var vId = [];
                    var v = this.vertices[i];
                    for (var j = 0; j < v.triangleCount; ++j) {
                        var triangle = this.triangles[this.references[v.triangleStart + j].triangleId];
                        for (var ii = 0; ii < 3; ii++) {
                            var ofs = 0;
                            var id = triangle.vertices[ii];
                            while (ofs < vCount.length) {
                                if (vId[ofs] === id)
                                    break;
                                ++ofs;
                            }
                            if (ofs == vCount.length) {
                                vCount.push(1);
                                vId.push(id);
                            } else {
                                vCount[ofs]++;
                            }
                        }
                    }

                    for (var j = 0; j < vCount.length; ++j) {
                        if (vCount[j] == 1) {
                            this.vertices[vId[j]].isBorder = true;
                        } else {
                            this.vertices[vId[j]].isBorder = false;
                        }
                    }
                }
            };

            Decimator.prototype.updateMesh = function (init) {
                if (typeof init === "undefined") { init = false; }
                if (!init) {
                    var dst = 0;
                    var newTrianglesVector = [];
                    for (var i = 0; i < this.triangles.length; ++i) {
                        if (!this.triangles[i].deleted) {
                            newTrianglesVector.push(this.triangles[i]);
                        }
                    }
                    this.triangles = newTrianglesVector;
                }

                for (var i = 0; i < this.vertices.length; ++i) {
                    this.vertices[i].triangleCount = 0;
                    this.vertices[i].triangleStart = 0;
                }

                for (var i = 0; i < this.triangles.length; ++i) {
                    var t = this.triangles[i];
                    for (var j = 0; j < 3; ++j) {
                        var v = this.vertices[t.vertices[j]];
                        v.triangleCount++;
                    }
                }

                var tStart = 0;

                for (var i = 0; i < this.vertices.length; ++i) {
                    this.vertices[i].triangleStart = tStart;
                    tStart += this.vertices[i].triangleCount;
                    this.vertices[i].triangleCount = 0;
                }

                var newReferences = new Array(this.triangles.length * 3);
                for (var i = 0; i < this.triangles.length; ++i) {
                    var t = this.triangles[i];
                    for (var j = 0; j < 3; ++j) {
                        var v = this.vertices[t.vertices[j]];
                        newReferences[v.triangleStart + v.triangleCount] = new Reference(j, i);
                        v.triangleCount++;
                    }
                }
                this.references = newReferences;

                if (init) {
                    this.identifyBorder();
                }
            };

            Decimator.prototype.vertexError = function (q, point) {
                var x = point.x;
                var y = point.y;
                var z = point.z;
                return q.data[0] * x * x + 2 * q.data[1] * x * y + 2 * q.data[2] * x * z + 2 * q.data[3] * x + q.data[4] * y * y + 2 * q.data[5] * y * z + 2 * q.data[6] * y + q.data[7] * z * z + 2 * q.data[8] * z + q.data[9];
            };

            Decimator.prototype.calculateError = function (vertex1, vertex2, pointResult, normalResult, uvResult) {
                var q = vertex1.q.add(vertex2.q);
                var border = vertex1.isBorder && vertex2.isBorder;
                var error = 0;
                var qDet = q.det(0, 1, 2, 1, 4, 5, 2, 5, 7);

                if (qDet != 0 && !border) {
                    if (!pointResult) {
                        pointResult = BABYLON.Vector3.Zero();
                    }
                    pointResult.x = -1 / qDet * (q.det(1, 2, 3, 4, 5, 6, 5, 7, 8));
                    pointResult.y = 1 / qDet * (q.det(0, 2, 3, 1, 5, 6, 2, 7, 8));
                    pointResult.z = -1 / qDet * (q.det(0, 1, 3, 1, 4, 6, 2, 5, 8));
                    error = this.vertexError(q, pointResult);

                    //TODO improve this
                    if (normalResult) {
                        normalResult.copyFrom(vertex1.normal);
                        uvResult.copyFrom(vertex1.uv);
                    }
                } else {
                    var p3 = (vertex1.position.add(vertex2.position)).divide(new BABYLON.Vector3(2, 2, 2));
                    var norm3 = (vertex1.normal.add(vertex2.normal)).divide(new BABYLON.Vector3(2, 2, 2)).normalize();
                    var error1 = this.vertexError(q, vertex1.position);
                    var error2 = this.vertexError(q, vertex2.position);
                    var error3 = this.vertexError(q, p3);
                    error = Math.min(error1, error2, error3);
                    if (error === error1) {
                        if (pointResult) {
                            pointResult.copyFrom(vertex1.position);
                            normalResult.copyFrom(vertex1.normal);
                            uvResult.copyFrom(vertex1.uv);
                        }
                    } else if (error === error2) {
                        if (pointResult) {
                            pointResult.copyFrom(vertex2.position);
                            normalResult.copyFrom(vertex2.normal);
                            uvResult.copyFrom(vertex2.uv);
                        }
                    } else {
                        if (pointResult) {
                            pointResult.copyFrom(p3);
                            normalResult.copyFrom(norm3);
                            uvResult.copyFrom(vertex1.uv);
                        }
                    }
                }

                //console.log(error, pointResult);
                return error;
            };
            return Decimator;
        })();
        Decimation.Decimator = Decimator;
    })(RaananW.Decimation || (RaananW.Decimation = {}));
    var Decimation = RaananW.Decimation;
})(RaananW || (RaananW = {}));
//# sourceMappingURL=Decimation.js.map
