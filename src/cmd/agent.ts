import { Logger, brightGreen, dir, generateName } from "../../deps.ts";
import { FLUENTCI_WS_URL } from "../consts.ts";

async function startAgent() {
  console.log(`
  .
      ______              __  _________
     / __/ /_ _____ ___  / /_/ ___/  _/
    / _// / // / -_) _ \\/ __/ /___/ /  
   /_/ /_/\\_,_/\\__/_//_/\\__/\\___/___/
   
  https://fluentci.io       
  `);
  const logger = new Logger();
  logger.info("Starting FluentCI Agent ...");

  let id = `${generateName()}_${Math.floor(Math.random() * 1000)}`;
  try {
    const data = await Deno.readFile(`${dir("home")}/.fluentci/agent-id`);
    id = new TextDecoder().decode(data);
  } catch (_) {
    await Deno.mkdir(`${dir("home")}/.fluentci`, { recursive: true });
    await Deno.writeTextFile(`${dir("home")}/.fluentci/agent-id`, id);
  }

  const websocket = new WebSocket(`${FLUENTCI_WS_URL}?id=${id}`);
  websocket.onopen = function () {
    logger.info(`Connected to FluentCI server as ${brightGreen(id)}`);
    logger.info("FluentCI Agent started successfully ✅");
    logger.info("Waiting for jobs ...");
    logger.info("Press Ctrl+C to exit");
  };
  websocket.addEventListener("message", function (event) {
    logger.info(`Message from server ${event.data}`);
    // TODO: Handle message
  });
}

export default startAgent;
