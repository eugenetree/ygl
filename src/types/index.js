"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Failure = exports.Success = void 0;
var Success = function (value) { return ({ ok: true, value: value }); };
exports.Success = Success;
var Failure = function (error) { return ({ ok: false, error: error }); };
exports.Failure = Failure;
