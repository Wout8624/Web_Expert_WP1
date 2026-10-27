const express = require('express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

const CONFIG = process.argv.slice(2)[0] || 'config.yaml';

let config;

try {
  config = yaml.load(
      fs.readFileSync(path.join(__dirname, CONFIG), 'utf8')
  );
} catch (error) {
  console.error('Error reading or parsing config:', error);
  process.exit(1);
}

// Middleware to parse JSON bodies
app.use(express.json());

// Tailwind CSS
app.use(express.static(path.join(__dirname, 'public')));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

function checkRoute(req, res, next) {
  const route = req.params.route;

  if (!config.routes || !config.routes.includes(route)) {
    return res.status(404).render('error', {
      title: '404 Not Found',
      error: `Route ${route} not found`
    });
  }

  next();
}

// ----------------------
// |   Landing page     |
// ----------------------
app.get('/', (req, res) => {
  res.render('index', {
    title: 'Configured Routes',
    routes: config.routes.map(r => ({ name: r, count: (config[r] || []).length }))
  });
});

// ----------------------------
// |  Embed relations helper  |
// ----------------------------
function embedRelation(route, record, embed) {
  const forward = (config.relationships?.[route] || [])
      .find(rel => rel.relatedRoute === embed);

  if (forward) {
    const ids = record[forward.foreignKey] || [];

    const related = (config[embed] || []).filter(item => ids.includes(item.id));

    return { ...record, [embed]: related };
  }

  const reverse = (config.relationships?.[embed] || [])
      .find(rel => rel.relatedRoute === route);

  if (reverse) {
    const related = (config[embed] || [])
        .filter(item => (item[reverse.foreignKey] || []).includes(record.id));

    return { ...record, [embed]: related };
  }

  return record;
}

// ----------------------------
// |   get all of a route     |
// ----------------------------
app.get('/:route', checkRoute, (req, res) => {
  const route = req.params.route;
  const embed = req.query._embed;
  let data = config[route] || [];

  if (embed) {
    data = data.map(item => embedRelation(route, item, embed));
  }

  res.json({
    title: route,
    route,
    data
  });
});

// ----------------------
// |     Get By Id      |
// ----------------------
app.get('/:route/:id', checkRoute, (req, res) => {
  const route = req.params.route;
  const id = Number(req.params.id);
  const data = config[route] || [];

  let record = data.find(item => item.id === id);

  if (!record) {
    return res.status(404).json({
      title: '404 Not Found',
      error: `Record with ID ${id} not found in ${route}`
    });
  }

  if (req.query._embed) {
    record = embedRelation(route, record, req.query._embed);
  }

  res.json({
    title: `${route} #${id}`,
    route,
    record
  });
});

// ----------------------
// |       Post         |
// ----------------------
// Save to the YAML file
function save() {
  fs.writeFileSync(CONFIG, yaml.dump(config));
}

function nextId(route) {
  const ids = (config[route] || []).map(item => item.id);
  return ids.length === 0 ? 1 : Math.max(...ids) + 1;
}

// Checks every foreign id exists.
// Returns a list of problems; an empty list means everything is fine.
function findUnknownIds(route, newRecord) {
  const problems = [];

  for (const { relatedRoute, foreignKey } of config.relationships?.[route] || []) {
    const existingIds = config[relatedRoute].map(item => item.id);

    for (const id of newRecord[foreignKey] || []) {
      if (!existingIds.includes(id)) {
        problems.push(`${foreignKey}: no ${relatedRoute} with id ${id}`);
      }
    }
  }

  return problems;
}

app.post('/:route', checkRoute, (req, res) => {
  const route = req.params.route;
  const newRecord = req.body;

  //check body is not empty
  if (!newRecord || Object.keys(newRecord).length === 0) {
    return res.status(400).json({ error: 'Request body is empty' });
  }

  // check if foreign relations are in order
  const problems = findUnknownIds(route, newRecord);
  if (problems.length > 0) {
    return res.status(400).json({ error: 'Invalid links', problems });
  }

  const record = { ...newRecord, id: nextId(route) };
  config[route] = config[route] || [];
  config[route].push(record);
  save();

  // 4. Send the new record back (same shape as "get by id")
  res.status(201).json({ title: `${route} #${record.id}`, route, record });
});

// ----------------------
// |   Setup server     |
// ----------------------
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});

const shutdown = () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);