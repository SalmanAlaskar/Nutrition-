"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeId = makeId;
/** Short, collision-resistant id for locally created records. */
function makeId(prefix = 'id') {
    const time = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${time}${random}`;
}
