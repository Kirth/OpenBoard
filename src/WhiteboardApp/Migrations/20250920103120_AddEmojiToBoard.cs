using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WhiteboardApp.Migrations
{
    /// <inheritdoc />
    public partial class AddEmojiToBoard : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    subjectid = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    username = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    email = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    displayname = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    timezone = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    theme = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "auto"),
                    createdat = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    lastloginat = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    isactive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "boards",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Emoji = table.Column<string>(type: "text", nullable: false),
                    createdat = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    updatedat = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    ispublic = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    adminpin = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ownerid = table.Column<Guid>(type: "uuid", nullable: false),
                    accesslevel = table.Column<int>(type: "integer", nullable: false, defaultValue: 1)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_boards", x => x.id);
                    table.ForeignKey(
                        name: "FK_boards_users_ownerid",
                        column: x => x.ownerid,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "boardcollaborators",
                columns: table => new
                {
                    boardid = table.Column<Guid>(type: "uuid", nullable: false),
                    userid = table.Column<Guid>(type: "uuid", nullable: false),
                    role = table.Column<int>(type: "integer", nullable: false),
                    grantedat = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    grantedbyuserid = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_boardcollaborators", x => new { x.boardid, x.userid });
                    table.ForeignKey(
                        name: "FK_boardcollaborators_boards_boardid",
                        column: x => x.boardid,
                        principalTable: "boards",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_boardcollaborators_users_grantedbyuserid",
                        column: x => x.grantedbyuserid,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_boardcollaborators_users_userid",
                        column: x => x.userid,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "boardelements",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    boardid = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    x = table.Column<double>(type: "double precision", nullable: false),
                    y = table.Column<double>(type: "double precision", nullable: false),
                    width = table.Column<double>(type: "double precision", nullable: true),
                    height = table.Column<double>(type: "double precision", nullable: true),
                    zindex = table.Column<int>(type: "integer", nullable: false),
                    createdby = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    createdbyuserid = table.Column<Guid>(type: "uuid", nullable: false),
                    modifiedbyuserid = table.Column<Guid>(type: "uuid", nullable: true),
                    createdat = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    modifiedat = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    data = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    groupid = table.Column<Guid>(type: "uuid", nullable: true),
                    grouporder = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_boardelements", x => x.id);
                    table.ForeignKey(
                        name: "FK_boardelements_boards_boardid",
                        column: x => x.boardid,
                        principalTable: "boards",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_boardelements_users_createdbyuserid",
                        column: x => x.createdbyuserid,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_boardelements_users_modifiedbyuserid",
                        column: x => x.modifiedbyuserid,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "userboardaccesses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    userid = table.Column<Guid>(type: "uuid", nullable: false),
                    boardid = table.Column<Guid>(type: "uuid", nullable: false),
                    lastaccessedat = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    accesscount = table.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                    isjoin = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_userboardaccesses", x => x.id);
                    table.ForeignKey(
                        name: "FK_userboardaccesses_boards_boardid",
                        column: x => x.boardid,
                        principalTable: "boards",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_userboardaccesses_users_userid",
                        column: x => x.userid,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_boardcollaborators_grantedbyuserid",
                table: "boardcollaborators",
                column: "grantedbyuserid");

            migrationBuilder.CreateIndex(
                name: "IX_boardcollaborators_role",
                table: "boardcollaborators",
                column: "role");

            migrationBuilder.CreateIndex(
                name: "IX_boardcollaborators_userid",
                table: "boardcollaborators",
                column: "userid");

            migrationBuilder.CreateIndex(
                name: "IX_boardelements_boardid",
                table: "boardelements",
                column: "boardid");

            migrationBuilder.CreateIndex(
                name: "IX_boardelements_createdbyuserid",
                table: "boardelements",
                column: "createdbyuserid");

            migrationBuilder.CreateIndex(
                name: "IX_boardelements_groupid",
                table: "boardelements",
                column: "groupid");

            migrationBuilder.CreateIndex(
                name: "IX_boardelements_modifiedbyuserid",
                table: "boardelements",
                column: "modifiedbyuserid");

            migrationBuilder.CreateIndex(
                name: "IX_boardelements_type",
                table: "boardelements",
                column: "type");

            migrationBuilder.CreateIndex(
                name: "IX_boards_accesslevel",
                table: "boards",
                column: "accesslevel");

            migrationBuilder.CreateIndex(
                name: "IX_boards_ownerid",
                table: "boards",
                column: "ownerid");

            migrationBuilder.CreateIndex(
                name: "IX_userboardaccesses_boardid",
                table: "userboardaccesses",
                column: "boardid");

            migrationBuilder.CreateIndex(
                name: "IX_userboardaccesses_lastaccessedat",
                table: "userboardaccesses",
                column: "lastaccessedat");

            migrationBuilder.CreateIndex(
                name: "IX_userboardaccesses_userid_boardid",
                table: "userboardaccesses",
                columns: new[] { "userid", "boardid" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_email",
                table: "users",
                column: "email");

            migrationBuilder.CreateIndex(
                name: "IX_users_subjectid",
                table: "users",
                column: "subjectid",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_username",
                table: "users",
                column: "username");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "boardcollaborators");

            migrationBuilder.DropTable(
                name: "boardelements");

            migrationBuilder.DropTable(
                name: "userboardaccesses");

            migrationBuilder.DropTable(
                name: "boards");

            migrationBuilder.DropTable(
                name: "users");
        }
    }
}
