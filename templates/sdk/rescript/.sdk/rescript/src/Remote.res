/** Typed pure primitives; execution and tool provisioning belong to the host DAG. */
type connection = {host: string, user: option<string>, port: int, identity: option<string>, install: bool}
type direction = Upload | Download
type action = Get | Put | List | Delete
type algorithm = Sha256 | Sha512
let connection = host => {host,user:None,port:22,identity:None,install:true}
let directionName = value => switch value { | Upload => "upload" | Download => "download" }
let actionName = value => switch value { | Get => "get" | Put => "put" | List => "list" | Delete => "delete" }
let algorithmName = value => switch value { | Sha256 => "sha256" | Sha512 => "sha512" }
@module("./remote_ffi.mjs") external detect: (string,string,string) => Matrix.task = "detect"
@module("./remote_ffi.mjs") external digest: (string,string,string,string,string) => Matrix.task = "digest"
@module("./remote_ffi.mjs") external ssh: (string,connection,array<string>,string) => Matrix.task = "ssh"
@module("./remote_ffi.mjs") external transfer: (string,string,connection,string,string,string,string) => Matrix.task = "transfer"
@module("./remote_ffi.mjs") external ftpOperation: (string,string,string,string,option<string>,option<string>,option<string>,bool,string) => Matrix.task = "ftp"
@module("./remote_ffi.mjs") external s3Operation: (string,string,string,string,option<string>,option<string>,option<string>,bool,string) => Matrix.task = "s3"
let os = (id,cwd) => detect(id,"os",cwd)
let arch = (id,cwd) => detect(id,"arch",cwd)
let digestText = (id,algorithm,text,cwd) => digest(id,algorithmName(algorithm),"text",text,cwd)
let digestFile = (id,algorithm,path,cwd) => digest(id,algorithmName(algorithm),"file",path,cwd)
let scp = (id,connection,direction,source,destination,cwd) => transfer(id,"scp",connection,directionName(direction),source,destination,cwd)
let sftp = (id,connection,direction,source,destination,cwd) => transfer(id,"sftp",connection,directionName(direction),source,destination,cwd)
let rsync = (id,connection,direction,source,destination,cwd) => transfer(id,"rsync",connection,directionName(direction),source,destination,cwd)
let ftp = (id,url,action,path,usernameEnv,passwordEnv,install,cwd) => ftpOperation(id,"ftp",url,actionName(action),path,usernameEnv,passwordEnv,install,cwd)
let ftps = (id,url,action,path,usernameEnv,passwordEnv,install,cwd) => ftpOperation(id,"ftps",url,actionName(action),path,usernameEnv,passwordEnv,install,cwd)
let s3 = (id,bucket,key,action,path,endpoint,region,install,cwd) => s3Operation(id,bucket,key,actionName(action),path,endpoint,region,install,cwd)
