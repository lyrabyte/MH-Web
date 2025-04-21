export class BlockRegistry {
  constructor() {
      this.types = {}; 
  }

  register(blockClass) {
      const typeName = blockClass?.blockType;
      if (!typeName) {
          console.error(`Block class missing static 'blockType'. Skipping registration.`, blockClass);
          return false;
      }
      if (this.types[typeName]) {
          console.warn(`Block type "${typeName}" already registered. Overwriting.`);
      }
      if (!blockClass.createInstance || !blockClass.createSidebarElement || !blockClass.label) {
           console.warn(`Block class ${blockClass.name||typeName} missing recommended static methods/props (createInstance, createSidebarElement, label).`);
      }

      this.types[typeName] = blockClass;
      return true;
  }

  getTypeNames() { return Object.keys(this.types); }

  getBlockClass(typeName) { return this.types[typeName] || null; }

  getAllBlockClasses() { return Object.values(this.types); }

  createPreview(typeName) {
      const BlockClass = this.getBlockClass(typeName);
      return typeof BlockClass?.createPreviewMesh === 'function' ? BlockClass.createPreviewMesh() : null;
  }

  createInstance(typeName, position) {
      const BlockClass = this.getBlockClass(typeName);
      if (typeof BlockClass?.createInstance !== 'function') { console.error(`No static createInstance method found for block type "${typeName}".`); return null; }
      const instance = BlockClass.createInstance(position);

      if (instance && (!instance.userData || instance.userData.blockType !== typeName)) {
           console.warn(`Instance created for "${typeName}" missing or has incorrect blockType in userData. Fixing.`);
           if(instance && !instance.userData) instance.userData = {};
           if(instance) instance.userData.blockType = typeName; 
      }
      return instance;
  }

  createSidebarElement(typeName) {
      const BlockClass = this.getBlockClass(typeName);
      return typeof BlockClass?.createSidebarElement === 'function' ? BlockClass.createSidebarElement() : null;
  }

  loadAllTextures() {
      console.log("Attempting texture loads for registered block types...");
      let count = 0;
      for (const typeName in this.types) {
          const BlockClass = this.types[typeName];
          if (typeof BlockClass?.loadTexture === 'function') {
              try {
                  BlockClass.loadTexture();
                  count++;
              } catch (err) {
                  console.error(`Error calling loadTexture for block type "${typeName}":`, err);
              }
          }
      }
      console.log(`Called loadTexture for ${count} block types.`);
  }
}