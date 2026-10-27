const express = require('express');
const path = require('path');
const { DataService, NotFoundError, ValidationError } = require('./service');

const app = express();
const PORT = 3000;

const CONFIG = process.argv.slice(2)[0] || 'config.yaml';

let service;

try {
  service = new DataService(path.join(__dirname, CONFIG));
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

  if (!service.hasRoute(route)) {
    return res.status(404).render('error', {
      title: '404 Not Found',
      error: `Route ${route} not found`
    });
  }

  next();
}

// Turns an error thrown by the service into a response
function sendError(res, error) {
  if (error instanceof NotFoundError) {
    return res.status(404).json({ title: '404 Not Found', error: error.message });
  }
  if (error instanceof ValidationError) {
    return res.status(400).json({ error: error.message, problems: error.problems });
  }

  console.error(error);
  res.status(500).json({ error: 'Something went wrong' });
}

// ----------------------
// |   Landing page     |
// ----------------------
app.get('/', (req, res) => {
  res.render('index', {
    title: 'Configured Routes',
    routes: service.listRoutes()
  });
});

// ----------------------------
// |   get all of a route     |
// ----------------------------
app.get('/:route', checkRoute, (req, res) => {
  const route = req.params.route;
  const data = service.getAll(route, req.query._embed);

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
  const id = req.params.id;

  try {
    const record = service.getById(route, id, req.query._embed);

    res.json({
      title: `${route} #${id}`,
      route,
      record
    });
  } catch (error) {
    sendError(res, error);
  }
});

// ----------------------
// |       Post         |
// ----------------------
app.post('/:route', checkRoute, (req, res) => {
  const route = req.params.route;

  try {
    const record = service.create(route, req.body);

    res.status(201).json({ title: `${route} #${record.id}`, route, record });
  } catch (error) {
    sendError(res, error);
  }
});

// ----------------------
// |       Put          |
// ----------------------
app.put('/:route/:id', checkRoute, (req, res) => {
  const route = req.params.route;
  const id = req.params.id;

  try {
    const record = service.update(route, id, req.body);

    res.json({ title: `${route} #${id}`, route, record });
  } catch (error) {
    sendError(res, error);
  }
});

// ----------------------
// |       delete          |
// ----------------------
app.delete('/:route/:id', checkRoute, (req, res) => {
  const route = req.params.route;
  const id = req.params.id;

  try {
    const deleted = service.delete(route, id);

    res.json({ title: `${route} #${deleted.id}`, route, record: deleted });
  } catch (error) {
    sendError(res, error);
  }
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

  // Write the in-memory data to the YAML file
  try {
    service.save();
    console.log('Saved changes to', CONFIG);
  } catch (error) {
    console.error('Could not save config:', error);
  }

  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
