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