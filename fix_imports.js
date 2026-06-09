const fs = require('fs');
const path = require('path');

const toolsDir = path.join(__dirname, 'src', 'mastra', 'tools');
const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.ts') && f !== 'index.ts');

files.forEach(file => {
  const filePath = path.join(toolsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix import path
  content = content.replace(/await import\('\.\.\/\.\.\/\.\.\/pb-compat\/env'\)/g, "await import('../../pb-compat')");

  // In addEvent and updateEvent, I might have duplicated `const client = getConvexClient();`.
  // Wait, no. The error was `Cannot redeclare block-scoped variable 'client'.`
  // I replaced my block *before* `const client = getConvexClient();`.
  // Wait! In `addEvent.ts`, `const client = getConvexClient();` is AT THE TOP of the execute function!
  // And my replacement put ANOTHER `const client = getConvexClient();` down below!
  // Let's remove the second one.
  content = content.replace(/const client = getConvexClient\(\);\n\s*const eventId = await client\.mutation/g, "const eventId = await client.mutation");
  content = content.replace(/const client = getConvexClient\(\);\n\s*await client\.mutation/g, "await client.mutation");

  fs.writeFileSync(filePath, content);
});

// Also fix route.ts
const routePath = path.join(__dirname, 'src', 'app', 'api', 'chat', 'route.ts');
let routeContent = fs.readFileSync(routePath, 'utf8');
routeContent = routeContent.replace(/import \{ isPbBackend \} from '@\/pb-compat\/env';/g, "import { isPbBackend } from '@/pb-compat';");
fs.writeFileSync(routePath, routeContent);

console.log('Fixed imports and declarations');
