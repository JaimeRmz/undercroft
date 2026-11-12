/** Persistent decals (blood/goo splats) that stick around for the life of the room. Pure data store. */
export class DecalLayer {
  constructor(max = 200) {
    this.max = max;
    this.decals = [];
  }

  add(decal) {
    if (this.decals.length >= this.max) this.decals.shift();
    this.decals.push(decal);
  }

  clear() {
    this.decals = [];
  }
}
