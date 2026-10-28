const yaml = require('js-yaml');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ----------------------
// |      Errors        |
// ----------------------

class NotFoundError extends Error {}


class ValidationError extends Error {
  constructor(message, problems = []) {
    super(message);
    this.problems = problems;
  }
}

// ----------------------
// |      Service       |
// ----------------------
class DataService {
  constructor(filePath) {
    this.filePath = filePath;
    // Read the yaml file on startup
    this.config = yaml.load(fs.readFileSync(filePath, 'utf8'));
  }

  // Write in-memory data to the file
  save() {
    fs.writeFileSync(this.filePath, yaml.dump(this.config));
  }

  hasRoute(route) {
    // check if route is in config
    return (this.config.routes || []).includes(route);
  }


  listRoutes() {
    // list all routes in config
    return this.config.routes.map(r => ({ name: r, count: (this.config[r] || []).length }));
  }

  // ----------------------
  // |     Get all        |
  // ----------------------
  getAll(route, embed, sort, order) {
    let data = this.config[route] || [];

    if (embed) {
      data = data.map(item => this.embedRelation(route, item, embed));
    }

    if (sort) {
      data = this.sortBy(data, sort, order);
    }

    return data;
  }

  // ----------------------
  // |     Get by id      |
  // ----------------------
  getById(route, id, embed) {
    let record = this.findRecord(route, id);

    if (embed) {
      record = this.embedRelation(route, record, embed);
    }

    return record;
  }

  // ----------------------
  // |       Create       |
  // ----------------------
  create(route, newRecord) {
    // check body is not empty
    if (!newRecord || Object.keys(newRecord).length === 0) {
      throw new ValidationError('Request body is empty');
    }

    // check if foreign relations are in order
    this.checkLinks(route, newRecord);

    const { id, ...fields } = newRecord;
    const record = { id: uuidv4(), ...fields };
    this.config[route] = this.config[route] || [];
    this.config[route].push(record);

    return record;
  }

  // ----------------------
  // |       Update       |
  // ----------------------
  update(route, id, updatedRecord) {
    // does the updated record exist ?
    const index = this.findIndex(route, id);

    // check if foreign relations are in order
    this.checkLinks(route, updatedRecord);

    // keep the id from the URL, ignore any id in the body
    const { id: _ignoredId, ...fields } = updatedRecord;
    const record = { id, ...fields };
    this.config[route][index] = record;

    return record;
  }

  // ----------------------
  // |       Delete       |
  // ----------------------
  delete(route, id) {
    // does the record exist ?
    const index = this.findIndex(route, id);

    const deleted = this.config[route][index];
    this.config[route] = this.config[route].filter(item => item.id !== id);

    // If a person is deleted, remove them as owner from every pet
    if (route === 'persons') {
      for (const pet of this.config.pets) {
        pet.ownerIds = (pet.ownerIds || []).filter(ownerId => ownerId !== id);
      }
    }

    return deleted;
  }

  // ----------------------
  // |      Helpers       |
  // ----------------------

  findIndex(route, id) {
    const index = (this.config[route] || []).findIndex(item => item.id === id);
    if (index === -1) {
      throw new NotFoundError(`Record with ID ${id} not found in ${route}`);
    }
    return index;
  }

  // Returns a sorted copy of the records, by one field.
  // order is 'asc' (A → Z, default) or 'desc' (Z → A).
  sortBy(records, field, order) {
    const direction = order === 'desc' ? -1 : 1;

    return [...records].sort((a, b) => {
      // Text: alphabetical, ignoring upper/lower case ("cat" before "Python")
      if (typeof a[field] === 'string' && typeof b[field] === 'string') {
        return a[field].localeCompare(b[field], undefined, { sensitivity: 'base' }) * direction;
      }

      // Anything else (numbers): compare as before
      if (a[field] < b[field]) return -1 * direction;
      if (a[field] > b[field]) return 1 * direction;
      return 0;
    });
  }

  findRecord(route, id) {
    return this.config[route][this.findIndex(route, id)];
  }

  // Checks every foreign id exists; throws with the list of problems if not
  checkLinks(route, record) {
    const problems = [];

    for (const { relatedRoute, foreignKey } of this.config.relationships?.[route] || []) {
      const existingIds = this.config[relatedRoute].map(item => item.id);

      for (const id of record[foreignKey] || []) {
        if (!existingIds.includes(id)) {
          problems.push(`${foreignKey}: no ${relatedRoute} with id ${id}`);
        }
      }
    }

    if (problems.length > 0) {
      throw new ValidationError('Invalid links', problems);
    }
  }

  embedRelation(route, record, embed) {
    // from pets to persons
    const forward = (this.config.relationships?.[route] || [])
        .find(rel => rel.relatedRoute === embed);

    if (forward) {
      const ids = record[forward.foreignKey] || [];

      const related = (this.config[embed] || []).filter(item => ids.includes(item.id));

      return { ...record, [embed]: related };
    }

    // from persons to pets
    const reverse = (this.config.relationships?.[embed] || [])
        .find(rel => rel.relatedRoute === route);

    if (reverse) {
      const related = (this.config[embed] || [])
          .filter(item => (item[reverse.foreignKey] || []).includes(record.id));

      return { ...record, [embed]: related };
    }

    return record;
  }
}

module.exports = { DataService, NotFoundError, ValidationError };
