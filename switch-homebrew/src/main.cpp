#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <switch.h>

/**
 * M.E.G. Backrooms Explorer - Native 3D Graphics Engine (libnx Framebuffer)
 *
 * Renders 3D Level 188 Courtyard & Corridors natively to 1280x720 3D Framebuffer.
 * Compatible with ALL Nintendo Switch emulators (Eden, Ryujinx, Yuzu) & physical hardware.
 */
int main(int argc, char **argv) {
    padConfigureInput(1, HidNpadStyleSet_NpadStandard);
    PadState pad;
    padInitializeDefault(&pad);

    // Initialize 1280x720 3D Framebuffer
    Framebuffer fb;
    framebufferCreate(&fb, nwindowGetDefault(), 1280, 720, PIXEL_FORMAT_RGBA_8888, 2);
    framebufferMakeLinear(&fb);

    float player_x = 2.0f;
    float player_y = 2.0f;
    float player_angle = 0.0f;

    // 2D Map of Level 188 Courtyard (1 = Concrete Wall, 0 = Open Courtyard, 2 = Fountain)
    const int MAP_W = 12;
    const int MAP_H = 12;
    const int map[12][12] = {
        {1,1,1,1,1,1,1,1,1,1,1,1},
        {1,0,0,0,0,0,0,0,0,0,0,1},
        {1,0,1,1,0,0,0,0,1,1,0,1},
        {1,0,1,0,0,0,0,0,0,1,0,1},
        {1,0,0,0,0,2,2,0,0,0,0,1},
        {1,0,0,0,0,2,2,0,0,0,0,1},
        {1,0,0,0,0,0,0,0,0,0,0,1},
        {1,0,1,0,0,0,0,0,0,1,0,1},
        {1,0,1,1,0,0,0,0,1,1,0,1},
        {1,0,0,0,0,0,0,0,0,0,0,1},
        {1,0,0,0,0,0,0,0,0,0,0,1},
        {1,1,1,1,1,1,1,1,1,1,1,1}
    };

    while (appletMainLoop()) {
        padUpdate(&pad);
        u64 kDown = padGetButtonsDown(&pad);

        if (kDown & HidNpadButton_Plus) {
            break;
        }

        // Controller Movement & Rotation
        if (kDown & HidNpadButton_Left) player_angle -= 0.1f;
        if (kDown & HidNpadButton_Right) player_angle += 0.1f;
        if (kDown & HidNpadButton_Up) {
            player_x += cosf(player_angle) * 0.2f;
            player_y += sinf(player_angle) * 0.2f;
        }
        if (kDown & HidNpadButton_Down) {
            player_x -= cosf(player_angle) * 0.2f;
            player_y -= sinf(player_angle) * 0.2f;
        }

        u32 stride;
        u32* pixels = (u32*)framebufferBegin(&fb, &stride);

        // 3D Raycasting Engine (1280x720 Resolution)
        const int SCREEN_W = 1280;
        const int SCREEN_H = 720;

        for (int x = 0; x < SCREEN_W; x += 2) {
            float rayAngle = (player_angle - 0.5f) + ((float)x / (float)SCREEN_W);
            float distanceToWall = 0.0f;
            bool hitWall = false;
            int wallType = 1;

            float eyeX = cosf(rayAngle);
            float eyeY = sinf(rayAngle);

            while (!hitWall && distanceToWall < 16.0f) {
                distanceToWall += 0.05f;
                int checkX = (int)(player_x + eyeX * distanceToWall);
                int checkY = (int)(player_y + eyeY * distanceToWall);

                if (checkX < 0 || checkX >= MAP_W || checkY < 0 || checkY >= MAP_H) {
                    hitWall = true;
                    distanceToWall = 16.0f;
                } else if (map[checkY][checkX] > 0) {
                    hitWall = true;
                    wallType = map[checkY][checkX];
                }
            }

            int ceiling = (float)(SCREEN_H / 2.0) - SCREEN_H / ((float)distanceToWall);
            int floor = SCREEN_H - ceiling;

            u32 wallColor = (wallType == 2) ? 0xFF808080 : 0xFF36738B; // Fountain grey vs Yellow wall
            u32 ceilingColor = 0xFF121212;
            u32 floorColor = 0xFF5A9EAE;

            for (int y = 0; y < SCREEN_H; y++) {
                u32 col = ceilingColor;
                if (y > ceiling && y <= floor) {
                    col = wallColor;
                } else if (y > floor) {
                    col = floorColor;
                }

                int idx = y * (stride / 4) + x;
                pixels[idx] = col;
                pixels[idx + 1] = col;
            }
        }

        framebufferEnd(&fb);
    }

    framebufferClose(&fb);
    return 0;
}
