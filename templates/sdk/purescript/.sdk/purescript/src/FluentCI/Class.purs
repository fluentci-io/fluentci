module FluentCI.Class where


import Effect (Effect)
import Effect.Aff (Aff)
import FluentCI.Cache as Cache
import FluentCI.Client as Client
import FluentCI.Devbox as Devbox
import FluentCI.Devenv as Devenv
import FluentCI.Directory as Directory
import FluentCI.Envhub as Envhub
import FluentCI.Flox as Flox
import FluentCI.Hermit as Hermit
import FluentCI.Mise as Mise
import FluentCI.Nix (NixArgs)
import FluentCI.Nix as Nix
import FluentCI.Pipeline as Pipeline
import FluentCI.Pixi as Pixi
import FluentCI.Pkgx as Pkgx
import FluentCI.Proto as Proto
import FluentCI.Secret as Secret
import FluentCI.Service as Service

class Id a where
  id :: a -> Aff String

instance Id Devbox.Devbox where
  id devbox = Devbox.id devbox

instance Id Devenv.Devenv where
  id devenv = Devenv.id devenv

instance Id Cache.Cache where
  id cache = Cache.id cache

instance Id Directory.Directory where
  id directory = Directory.id directory

instance Id Mise.Mise where
  id mise = Mise.id mise

instance Id Nix.Nix where
  id nix = Nix.id nix

instance Id Pixi.Pixi where
  id pixi = Pixi.id pixi

instance Id Pkgx.Pkgx where
  id pkgx = Pkgx.id pkgx

instance Id Flox.Flox where
  id flox = Flox.id flox

instance Id Pipeline.Pipeline where
  id pipeline = Pipeline.id pipeline

instance Id Service.Service where
  id service = Service.id service

instance Id Secret.Secret where
  id secret = Secret.id secret

instance Id Proto.Proto where
  id proto = Proto.id proto

instance Id Hermit.Hermit where
  id hermit = Hermit.id hermit

class Stderr a where
  stderr :: a -> Aff String

instance Stderr Pipeline.Pipeline where
  stderr pipeline = Pipeline.stderr pipeline

instance Stderr Mise.Mise where
  stderr mise = Mise.stderr mise

instance Stderr Devbox.Devbox where
  stderr devbox = Devbox.stderr devbox

instance Stderr Devenv.Devenv where
  stderr devenv = Devenv.stderr devenv

instance Stderr Nix.Nix where
  stderr nix = Nix.stderr nix

instance Stderr Pixi.Pixi where
  stderr pixi = Pixi.stderr pixi

instance Stderr Pkgx.Pkgx where
  stderr pkgx = Pkgx.stderr pkgx

instance Stderr Flox.Flox where
  stderr flox = Flox.stderr flox

instance Stderr Directory.Directory where
  stderr directory = Directory.stderr directory

instance Stderr Proto.Proto where
  stderr proto = Proto.stderr proto

instance Stderr Hermit.Hermit where
  stderr hermit = Hermit.stderr hermit


class Stdout a where
  stdout :: a -> Aff String

instance Stdout Pipeline.Pipeline where
  stdout pipeline = Pipeline.stdout pipeline

instance Stdout Mise.Mise where
  stdout mise = Mise.stdout mise

instance Stdout Devbox.Devbox where
  stdout devbox = Devbox.stdout devbox

instance Stdout Devenv.Devenv where
  stdout devenv = Devenv.stdout devenv

instance Stdout Nix.Nix where
  stdout nix = Nix.stdout nix

instance Stdout Pixi.Pixi where
  stdout pixi = Pixi.stdout pixi

instance Stdout Pkgx.Pkgx where
  stdout pkgx = Pkgx.stdout pkgx

instance Stdout Flox.Flox where
  stdout flox = Flox.stdout flox

instance Stdout Directory.Directory where
  stdout directory = Directory.stdout directory

instance Stdout Proto.Proto where
  stdout proto = Proto.stdout proto

instance Stdout Hermit.Hermit where
  stdout hermit = Hermit.stdout hermit

class AsService a where
  asService :: String -> a -> Effect Service.Service

instance AsService Devbox.Devbox where
  asService name devbox = Devbox.asService devbox name

instance AsService Devenv.Devenv where
  asService name devenv = Devenv.asService devenv name

instance AsService Nix.Nix where
  asService name nix = Nix.asService nix name

instance AsService Mise.Mise where
  asService name mise = Mise.asService mise name

instance AsService Pipeline.Pipeline where
  asService name pipeline = Pipeline.asService name pipeline

instance AsService Pixi.Pixi where
  asService name pixi = Pixi.asService pixi name

instance AsService Pkgx.Pkgx where
  asService name pkgx = Pkgx.asService pkgx name

instance AsService Flox.Flox where
  asService name flox = Flox.asService flox name

instance AsService Proto.Proto where
  asService name proto = Proto.asService proto name

instance AsService Hermit.Hermit where
  asService name hermit = Hermit.asService hermit name


class WaitOn a where
  waitOn :: Int -> Int -> a -> Effect a

instance WaitOn Devbox.Devbox where
  waitOn port timeout devbox = Devbox.waitOn devbox port timeout

instance WaitOn Devenv.Devenv where
  waitOn port timeout devenv = Devenv.waitOn devenv port timeout

instance WaitOn Nix.Nix where
  waitOn port timeout nix = Nix.waitOn nix port timeout

instance WaitOn Mise.Mise where
  waitOn port timeout mise = Mise.waitOn mise port timeout

instance WaitOn Pipeline.Pipeline where
  waitOn port timeout pipeline = Pipeline.waitOn port timeout pipeline

instance WaitOn Pixi.Pixi where
  waitOn port timeout pixi = Pixi.waitOn pixi port timeout

instance WaitOn Pkgx.Pkgx where
  waitOn port timeout pkgx = Pkgx.waitOn pkgx port timeout

instance WaitOn Flox.Flox where
  waitOn port timeout flox = Flox.waitOn flox port timeout

instance WaitOn Proto.Proto where
  waitOn port timeout proto = Proto.waitOn proto port timeout

instance WaitOn Hermit.Hermit where
  waitOn port timeout hermit = Hermit.waitOn hermit port timeout



class WithCache a where
  withCache :: Cache.Cache -> a -> Effect a

instance WithCache Devbox.Devbox where
  withCache cache devbox = Devbox.withCache devbox cache

instance WithCache Devenv.Devenv where
  withCache cache devenv = Devenv.withCache devenv cache

instance WithCache Nix.Nix where
  withCache cache nix = Nix.withCache nix cache

instance WithCache Mise.Mise where
  withCache cache mise = Mise.withCache mise cache

instance WithCache Pipeline.Pipeline where
  withCache cache pipeline = Pipeline.withCache cache pipeline

instance WithCache Pixi.Pixi where
  withCache cache pixi = Pixi.withCache pixi cache

instance WithCache Pkgx.Pkgx where
  withCache cache pkgx = Pkgx.withCache pkgx cache

instance WithCache Flox.Flox where
  withCache cache flox = Flox.withCache flox cache

instance WithCache Proto.Proto where
  withCache cache proto = Proto.withCache proto cache

instance WithCache Hermit.Hermit where
  withCache cache hermit = Hermit.withCache hermit cache


class WithEnvVariable a where
  withEnvVariable :: String -> String -> a -> Effect a

instance WithEnvVariable Devbox.Devbox where
  withEnvVariable name value devbox = Devbox.withEnvVariable devbox name value

instance WithEnvVariable Devenv.Devenv where
  withEnvVariable name value devenv = Devenv.withEnvVariable devenv name value

instance WithEnvVariable Nix.Nix where
  withEnvVariable name value nix = Nix.withEnvVariable nix name value

instance WithEnvVariable Mise.Mise where
  withEnvVariable name value mise = Mise.withEnvVariable mise name value

instance WithEnvVariable Pipeline.Pipeline where
  withEnvVariable name value pipeline = Pipeline.withEnvVariable name value pipeline

instance WithEnvVariable Pixi.Pixi where
  withEnvVariable name value pixi = Pixi.withEnvVariable pixi name value

instance WithEnvVariable Pkgx.Pkgx where
  withEnvVariable name value pkgx = Pkgx.withEnvVariable pkgx name value

instance WithEnvVariable Flox.Flox where
  withEnvVariable name value flox = Flox.withEnvVariable flox name value

instance WithEnvVariable Proto.Proto where
  withEnvVariable name value proto = Proto.withEnvVariable proto name value

instance WithEnvVariable Hermit.Hermit where
  withEnvVariable name value hermit = Hermit.withEnvVariable hermit name value


class WithExec a where
  withExec :: Array String -> a -> Effect a

instance WithExec Devbox.Devbox where
  withExec args devbox = Devbox.withExec devbox args

instance WithExec Devenv.Devenv where
  withExec args devenv = Devenv.withExec devenv args

instance WithExec Nix.Nix where
  withExec args nix = Nix.withExec nix args

instance WithExec Mise.Mise where
  withExec args mise = Mise.withExec mise args

instance WithExec Pipeline.Pipeline where
  withExec args pipeline = Pipeline.withExec args pipeline

instance WithExec Pixi.Pixi where
  withExec args pixi = Pixi.withExec pixi args

instance WithExec Pkgx.Pkgx where
  withExec args pkgx = Pkgx.withExec pkgx args

instance WithExec Flox.Flox where
  withExec args flox = Flox.withExec flox args

instance WithExec Directory.Directory where
  withExec args directory = Directory.withExec directory args

instance WithExec Proto.Proto where
  withExec args proto = Proto.withExec proto args

instance WithExec Hermit.Hermit where
  withExec args hermit = Hermit.withExec hermit args

class WithSecretVariable a where
  withSecretVariable :: String -> Secret.Secret -> a -> Effect a

instance WithSecretVariable Devbox.Devbox where
  withSecretVariable name secret devbox = Devbox.withSecretVariable devbox name secret

instance WithSecretVariable Devenv.Devenv where
  withSecretVariable name secret devenv = Devenv.withSecretVariable devenv name secret

instance WithSecretVariable Nix.Nix where
  withSecretVariable name secret nix = Nix.withSecretVariable nix name secret

instance WithSecretVariable Mise.Mise where
  withSecretVariable name secret mise = Mise.withSecretVariable mise name secret

instance WithSecretVariable Pipeline.Pipeline where
  withSecretVariable name secret pipeline = Pipeline.withSecretVariable name secret pipeline

instance WithSecretVariable Pixi.Pixi where
  withSecretVariable name secret pixi = Pixi.withSecretVariable pixi name secret

instance WithSecretVariable Pkgx.Pkgx where
  withSecretVariable name secret pkgx = Pkgx.withSecretVariable pkgx name secret

instance WithSecretVariable Flox.Flox where
  withSecretVariable name secret flox = Flox.withSecretVariable flox name secret

instance WithSecretVariable Proto.Proto where
  withSecretVariable name secret proto = Proto.withSecretVariable proto name secret

instance WithSecretVariable Hermit.Hermit where
  withSecretVariable name secret hermit = Hermit.withSecretVariable hermit name secret

class WithService a where
  withService :: Service.Service -> a -> Effect a

instance WithService Devbox.Devbox where
  withService service devbox = Devbox.withService devbox service

instance WithService Devenv.Devenv where
  withService service devenv = Devenv.withService devenv service

instance WithService Nix.Nix where
  withService service nix = Nix.withService nix service

instance WithService Mise.Mise where
  withService service mise = Mise.withService mise service

instance WithService Pipeline.Pipeline where
  withService service pipeline = Pipeline.withService service pipeline

instance WithService Pixi.Pixi where
  withService service pixi = Pixi.withService pixi service

instance WithService Pkgx.Pkgx where
  withService service pkgx = Pkgx.withService pkgx service

instance WithService Flox.Flox where
  withService service flox = Flox.withService flox service

instance WithService Proto.Proto where
  withService service proto = Proto.withService proto service

instance WithService Hermit.Hermit where
  withService service hermit = Hermit.withService hermit service

class WithWorkdir a where
  withWorkdir :: String -> a -> Effect a

instance WithWorkdir Devbox.Devbox where
  withWorkdir path devbox = Devbox.withWorkdir devbox path

instance WithWorkdir Devenv.Devenv where
  withWorkdir path devenv = Devenv.withWorkdir devenv path

instance WithWorkdir Nix.Nix where
  withWorkdir path nix = Nix.withWorkdir nix path

instance WithWorkdir Mise.Mise where
  withWorkdir path mise = Mise.withWorkdir mise path

instance WithWorkdir Pipeline.Pipeline where
  withWorkdir path pipeline = Pipeline.withWorkdir path pipeline

instance WithWorkdir Pixi.Pixi where
  withWorkdir path pixi = Pixi.withWorkdir pixi path

instance WithWorkdir Pkgx.Pkgx where
  withWorkdir path pkgx = Pkgx.withWorkdir pkgx path

instance WithWorkdir Flox.Flox where
  withWorkdir path flox = Flox.withWorkdir flox path

instance WithWorkdir Proto.Proto where
  withWorkdir path proto = Proto.withWorkdir proto path

instance WithWorkdir Hermit.Hermit where
  withWorkdir path hermit = Hermit.withWorkdir hermit path

class Devbox a where
  devbox :: a -> Effect Devbox.Devbox

instance Devbox Pipeline.Pipeline where
  devbox pipeline = Pipeline.devbox pipeline

instance Devbox Directory.Directory where
  devbox directory = Directory.devbox directory

instance Devbox Client.Client where
  devbox client = Client.devbox client

class Mise a where
  mise :: a -> Effect Mise.Mise

instance Mise Pipeline.Pipeline where
  mise pipeline = Pipeline.mise pipeline

instance Mise Directory.Directory where
  mise directory = Directory.mise directory

instance Mise Client.Client where
  mise client = Client.mise client

class Nix a where
  nix :: NixArgs -> a -> Effect Nix.Nix

instance Nix Pipeline.Pipeline where
  nix args pipeline = Pipeline.nix args pipeline

instance Nix Directory.Directory where
  nix args directory = Directory.nix directory args

instance Nix Client.Client where
  nix args client = Client.nix client args

class Pixi a where
  pixi :: a -> Effect Pixi.Pixi

instance Pixi Pipeline.Pipeline where
  pixi pipeline = Pipeline.pixi pipeline

instance Pixi Directory.Directory where
  pixi directory = Directory.pixi directory

instance Pixi Client.Client where
  pixi client = Client.pixi client

class Pkgx a where
  pkgx :: a -> Effect Pkgx.Pkgx

instance Pkgx Pipeline.Pipeline where
  pkgx pipeline = Pipeline.pkgx pipeline

instance Pkgx Directory.Directory where
  pkgx directory = Directory.pkgx directory

instance Pkgx Client.Client where
  pkgx client = Client.pkgx client

class Proto a where
  proto :: a -> Effect Proto.Proto

instance Proto Pipeline.Pipeline where
  proto pipeline = Pipeline.proto pipeline

instance Proto Directory.Directory where
  proto directory = Directory.proto directory

instance Proto Client.Client where
  proto client = Client.proto client

class Hermit a where
  hermit :: a -> Effect Hermit.Hermit

instance Hermit Pipeline.Pipeline where
  hermit pipeline = Pipeline.hermit pipeline

instance Hermit Directory.Directory where
  hermit directory = Directory.hermit directory

instance Hermit Client.Client where
  hermit client = Client.hermit client

class Flox a where
  flox :: a -> Effect Flox.Flox

instance Flox Pipeline.Pipeline where
  flox pipeline = Pipeline.flox pipeline

instance Flox Directory.Directory where
  flox directory = Directory.flox directory

instance Flox Client.Client where
  flox client = Client.flox client

class Devenv a where
  devenv :: a -> Effect Devenv.Devenv

instance Devenv Pipeline.Pipeline where
  devenv pipeline = Pipeline.devenv pipeline

instance Devenv Directory.Directory where
  devenv directory = Directory.devenv directory

instance Devenv Client.Client where
  devenv client = Client.devenv client

class Envhub a where
  envhub :: a -> Effect Envhub.Envhub

instance Envhub Pipeline.Pipeline where
  envhub pipeline = Pipeline.envhub pipeline

instance Envhub Directory.Directory where
  envhub directory = Directory.envhub directory

instance Envhub Client.Client where
  envhub client = Client.envhub client
